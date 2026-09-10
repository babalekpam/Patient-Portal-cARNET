// Platform-independent storage engine; the native driver is Keychain/Keystore.
export interface SecretDriver {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const MAX_CHUNKS = 256;
const CHUNK_SIZE = 350; // <= 1,400 UTF-8 bytes, including emoji.
const INDEX = "carnet_secure_index";

export function assertStorageKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(key)) {
    throw new Error("Invalid secure storage key.");
  }
}

interface Manifest {
  version: 2;
  generation: string;
  chunks: number;
}

function decodeManifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Manifest;
  if (
    value.version !== 2 ||
    !/^[a-z0-9-]+$/.test(value.generation) ||
    !Number.isInteger(value.chunks) ||
    value.chunks < 1 ||
    value.chunks > MAX_CHUNKS
  ) throw new Error("Secure storage is damaged. Sign out to clear local data.");
  return value;
}

export class SecureStorageEngine {
  private sequence = 0;
  constructor(private driver: SecretDriver) {}

  private async inventory(): Promise<string[]> {
    const raw = await this.driver.get(INDEX);
    if (!raw) return [];
    const keys: unknown = JSON.parse(raw);
    if (!Array.isArray(keys) || keys.length > 128 || keys.some(k => typeof k !== "string")) {
      throw new Error("Secure storage inventory is damaged.");
    }
    keys.forEach(assertStorageKey);
    return keys;
  }

  async keys(): Promise<string[]> { return this.inventory(); }

  async get(key: string): Promise<string | null> {
    assertStorageKey(key);
    const manifest = decodeManifest(await this.driver.get(`${key}.__meta`));
    if (!manifest) return null;
    const chunks: string[] = [];
    for (let i = 0; i < manifest.chunks; i++) {
      const value = await this.driver.get(`${key}.${manifest.generation}.${i}`);
      if (value === null) throw new Error("Secure storage is incomplete. Please sign in again.");
      chunks.push(value);
    }
    return chunks.join("");
  }

  async set(key: string, value: string): Promise<void> {
    assertStorageKey(key);
    const chars = Array.from(value);
    const chunks: string[] = [];
    for (let i = 0; i < chars.length; i += CHUNK_SIZE) chunks.push(chars.slice(i, i + CHUNK_SIZE).join(""));
    if (!chunks.length) chunks.push("");
    if (chunks.length > MAX_CHUNKS) throw new Error("Local record is too large to store safely.");
    const keys = await this.inventory();
    if (!keys.includes(key)) {
      if (keys.length >= 128) throw new Error("Local secure storage is full.");
      const inventory = JSON.stringify([...keys, key]);
      if (inventory.length > 1600) throw new Error("Local secure storage is full.");
      // Inventory first: even interrupted writes are known to cleanup.
      await this.driver.set(INDEX, inventory);
    }
    const previous = decodeManifest(await this.driver.get(`${key}.__meta`));
    const interrupted = decodeManifest(await this.driver.get(`${key}.__pending`));
    if (interrupted && interrupted.generation !== previous?.generation) {
      await this.removeChunks(key, interrupted);
    }
    const manifest: Manifest = { version: 2, generation: `${Date.now().toString(36)}-${(++this.sequence).toString(36)}`, chunks: chunks.length };
    await this.driver.set(`${key}.__pending`, JSON.stringify(manifest));
    try {
      for (let i = 0; i < chunks.length; i++) await this.driver.set(`${key}.${manifest.generation}.${i}`, chunks[i]);
      await this.driver.set(`${key}.__meta`, JSON.stringify(manifest)); // Commit last.
    } catch (error) {
      await this.removeChunks(key, manifest);
      await this.driver.remove(`${key}.__pending`);
      throw error;
    }
    if (previous) await this.removeChunks(key, previous);
    await this.driver.remove(`${key}.__pending`);
  }

  private async removeChunks(key: string, manifest: Manifest): Promise<void> {
    for (let i = 0; i < manifest.chunks; i++) await this.driver.remove(`${key}.${manifest.generation}.${i}`);
  }

  async remove(key: string): Promise<void> {
    assertStorageKey(key);
    for (const suffix of ["__meta", "__pending"]) {
      const manifest = decodeManifest(await this.driver.get(`${key}.${suffix}`));
      if (manifest) await this.removeChunks(key, manifest);
      await this.driver.remove(`${key}.${suffix}`);
    }
    const keys = await this.inventory();
    await this.driver.set(INDEX, JSON.stringify(keys.filter(k => k !== key)));
  }
}