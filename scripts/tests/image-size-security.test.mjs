import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(filename), '../..');
const mobileRequire = createRequire(path.join(root, 'artifacts/mobile/package.json'));

function installedMetros() {
  const expoCliPackage = mobileRequire.resolve('@expo/cli/package.json');
  const reactNativePackage = mobileRequire.resolve('react-native/package.json');
  const reactNativeRequire = createRequire(reactNativePackage);
  const communityCliPackage = reactNativeRequire.resolve(
    '@react-native/community-cli-plugin/package.json',
  );
  const parents = [
    ['@expo/cli', expoCliPackage],
    ['@react-native/community-cli-plugin', communityCliPackage],
  ];
  const byVersion = new Map();

  for (const [parent, packagePath] of parents) {
    const parentRequire = createRequire(packagePath);
    const metroPackage = parentRequire.resolve('metro/package.json');
    const version = JSON.parse(fs.readFileSync(metroPackage, 'utf8')).version;
    const assetsPath = path.join(path.dirname(metroPackage), 'src/Assets.js');
    const assets = parentRequire(assetsPath);
    assert.equal(typeof assets.getAssetSize, 'function');
    assert.equal(typeof assets.getAssetData, 'function');
    byVersion.set(version, {
      parent,
      metroPackage,
      getAssetData: assets.getAssetData,
      getAssetSize: assets.getAssetSize,
    });
  }

  assert.deepEqual(
    [...byVersion.keys()].sort(),
    ['0.83.3', '0.83.5'],
    'the test must exercise every installed Metro version',
  );
  return [...byVersion.entries()];
}

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function box(type, payload, size = 8 + payload.length) {
  return Buffer.concat([u32(size), Buffer.from(type, 'ascii'), payload]);
}

function fixtures() {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(png);
  png.writeUInt32BE(37, 16);
  png.writeUInt32BE(23, 20);

  const jpeg = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffc00011080017002503011100021100031100ffd9',
    'hex',
  );

  const bmp = Buffer.alloc(54);
  bmp.write('BM');
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(37, 18);
  bmp.writeInt32LE(23, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);

  const gif = Buffer.alloc(13);
  gif.write('GIF89a');
  gif.writeUInt16LE(37, 6);
  gif.writeUInt16LE(23, 8);

  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0);
  webp.writeUInt32LE(22, 4);
  webp.write('WEBPVP8X', 8);
  webp.writeUInt32LE(10, 16);
  webp.writeUIntLE(36, 24, 3);
  webp.writeUIntLE(22, 27, 3);

  const psd = Buffer.alloc(26);
  psd.write('8BPS');
  psd.writeUInt16BE(1, 4);
  psd.writeUInt16BE(3, 12);
  psd.writeUInt32BE(23, 14);
  psd.writeUInt32BE(37, 18);
  psd.writeUInt16BE(8, 22);
  psd.writeUInt16BE(3, 24);

  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="37" height="23"></svg>',
  );

  const tiff = Buffer.alloc(38);
  tiff.write('II');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(256, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(37, 18);
  tiff.writeUInt16LE(257, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(23, 30);

  const ktx1le = Buffer.alloc(64);
  Buffer.from('ab4b5458203131bb0d0a1a0a', 'hex').copy(ktx1le);
  Buffer.from([1, 2, 3, 4]).copy(ktx1le, 12);
  ktx1le.writeUInt32LE(1, 20);
  ktx1le.writeUInt32LE(0x8d64, 28);
  ktx1le.writeUInt32LE(0x1907, 32);
  ktx1le.writeUInt32LE(37, 36);
  ktx1le.writeUInt32LE(23, 40);
  ktx1le.writeUInt32LE(1, 52);
  ktx1le.writeUInt32LE(1, 56);

  const ktx1be = Buffer.alloc(64);
  Buffer.from('ab4b5458203131bb0d0a1a0a', 'hex').copy(ktx1be);
  Buffer.from([4, 3, 2, 1]).copy(ktx1be, 12);
  ktx1be.writeUInt32BE(1, 20);
  ktx1be.writeUInt32BE(0x8d64, 28);
  ktx1be.writeUInt32BE(0x1907, 32);
  ktx1be.writeUInt32BE(37, 36);
  ktx1be.writeUInt32BE(23, 40);
  ktx1be.writeUInt32BE(1, 52);
  ktx1be.writeUInt32BE(1, 56);

  const ktx2 = Buffer.alloc(104);
  Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex').copy(ktx2);
  ktx2.writeUInt32LE(37, 12);
  ktx2.writeUInt32LE(1, 16);
  ktx2.writeUInt32LE(37, 20);
  ktx2.writeUInt32LE(23, 24);
  ktx2.writeUInt32LE(1, 36);
  ktx2.writeUInt32LE(1, 40);

  return { png, jpeg, bmp, gif, webp, psd, svg, tiff, ktx1le, ktx1be, ktx2 };
}

function maliciousFixtures() {
  const icns = Buffer.concat([
    Buffer.from('icns'),
    u32(16),
    Buffer.from('ic07'),
    u32(0),
  ]);
  const jxlSignature = box('JXL ', Buffer.from('0d0a870a', 'hex'));
  const jxl = Buffer.concat([jxlSignature, box('ftyp', Buffer.from('jxl '), 0)]);
  const avif = box('ftyp', Buffer.from('avif'), 0);
  const malformedJxl = Buffer.concat([
    jxlSignature,
    box('ftyp', Buffer.concat([Buffer.from('jxl '), u32(0)])),
    Buffer.concat([u32(4), Buffer.from('free')]),
  ]);
  const malformedAvif = Buffer.concat([
    box('ftyp', Buffer.concat([Buffer.from('avif'), u32(0)])),
    Buffer.concat([u32(0xffffffff), Buffer.from('meta')]),
  ]);
  const unsafeExtendedAvif = Buffer.concat([
    box('ftyp', Buffer.concat([Buffer.from('avif'), u32(0)])),
    u32(1),
    Buffer.from('meta'),
    u32(0x00200000),
    u32(0),
  ]);
  return { icns, jxl, avif, malformedJxl, malformedAvif, unsafeExtendedAvif };
}

function assertSize(getAssetSize, extension, content, label = extension) {
  assert.deepEqual(getAssetSize(extension, content, label), { width: 37, height: 23 });
}

const cases = {
  formats() {
    const data = fixtures();
    for (const [version, { getAssetSize }] of installedMetros()) {
      for (const extension of ['jpg', 'jpeg']) {
        assertSize(getAssetSize, extension, data.jpeg, `${version}.${extension}`);
      }
      for (const extension of ['png', 'bmp', 'gif', 'webp', 'psd', 'svg', 'tiff']) {
        assertSize(getAssetSize, extension, data[extension], `${version}.${extension}`);
      }
      for (const ktx of [data.ktx1le, data.ktx1be, data.ktx2]) {
        assertSize(getAssetSize, 'ktx', ktx, `${version}.ktx`);
      }
    }
  },

  trackedAssets() {
    const mislabelledPdf = 'artifacts/mobile/assets/images/logo.svg';
    const extensions = new Set([
      'png',
      'jpg',
      'jpeg',
      'bmp',
      'gif',
      'webp',
      'psd',
      'svg',
      'tiff',
      'ktx',
    ]);
    const files = execFileSync('git', ['ls-files', '-z', 'artifacts'], {
      cwd: root,
      encoding: 'buffer',
    })
      .toString()
      .split('\0')
      .filter(Boolean)
      .filter((file) => extensions.has(path.extname(file).slice(1).toLowerCase()));
    assert.ok(files.length > 0, 'expected tracked image assets');
    assert.ok(files.includes(mislabelledPdf), 'expected the known mislabelled PDF asset');
    assert.equal(
      fs.readFileSync(path.join(root, mislabelledPdf)).subarray(0, 5).toString('ascii'),
      '%PDF-',
      `${mislabelledPdf} must remain classified by its actual PDF magic`,
    );

    for (const [version, { getAssetSize }] of installedMetros()) {
      for (const file of files) {
        const extension = path.extname(file).slice(1).toLowerCase();
        const content = fs.readFileSync(path.join(root, file));
        if (file === mislabelledPdf) {
          assert.throws(
            () => getAssetSize(extension, content, file),
            /unsupported|unable.*valid image/i,
            `${version} accepted the PDF content mislabelled as SVG`,
          );
          continue;
        }
        const dimensions = getAssetSize(extension, content, file);
        assert.ok(dimensions.width > 0, `${version} returned invalid width for ${file}`);
        assert.ok(dimensions.height > 0, `${version} returned invalid height for ${file}`);
      }
    }
  },

  async filesystem() {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-assets-'));
    const createAsset = (directory, basename, content) => {
      const assetDirectory = path.join(temporaryRoot, directory);
      fs.mkdirSync(assetDirectory);
      const assetPath = path.join(assetDirectory, basename);
      fs.writeFileSync(assetPath, content);
      return assetPath;
    };

    try {
      const png2x = Buffer.from(fixtures().png);
      png2x.writeUInt32BE(74, 16);
      png2x.writeUInt32BE(46, 20);
      const validPath = createAsset('valid', 'icon@2x.png', png2x);
      const emptyPath = createAsset('empty', 'empty.png', Buffer.alloc(0));
      const invalidPath = createAsset('invalid', 'invalid.png', Buffer.from('not an image'));
      const nonimagePath = createAsset(
        'nonimage',
        'document.png',
        Buffer.from('%PDF-1.3\nnot an image'),
      );

      for (const [version, { getAssetData }] of installedMetros()) {
        const metadata = await getAssetData(
          validPath,
          'images/icon@2x.png',
          [],
          null,
          '/assets',
        );
        assert.equal(metadata.width, 37, `${version} did not normalize @2x width`);
        assert.equal(metadata.height, 23, `${version} did not normalize @2x height`);
        assert.equal(metadata.name, 'icon');
        assert.equal(metadata.type, 'png');
        assert.deepEqual(metadata.scales, [2]);
        assert.deepEqual(metadata.files, [validPath]);
        assert.equal(metadata.fileSystemLocation, path.dirname(validPath));
        assert.equal(metadata.httpServerLocation, '/assets/images');
        assert.match(metadata.hash, /^[a-f0-9]{32}$/);
        assert.equal(metadata.__packager_asset, true);

        await assert.rejects(
          getAssetData(emptyPath, 'empty.png', [], null, '/assets'),
          /empty|unable|invalid/i,
          `${version} accepted an empty image file`,
        );
        await assert.rejects(
          getAssetData(invalidPath, 'invalid.png', [], null, '/assets'),
          /unable|invalid|unsupported/i,
          `${version} accepted invalid image bytes`,
        );
        await assert.rejects(
          getAssetData(nonimagePath, 'document.png', [], null, '/assets'),
          /unable|invalid|unsupported/i,
          `${version} accepted non-image PDF bytes`,
        );
      }
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },

  hostile() {
    const hostile = maliciousFixtures();
    const { ktx1le, ktx2 } = fixtures();
    for (const [, { getAssetSize }] of installedMetros()) {
      // Unsupported extensions return null before content is inspected: this is
      // Metro's normal getAssetSize contract.
      assert.equal(getAssetSize('icns', hostile.icns, 'bad.icns'), null);
      assert.equal(getAssetSize('jxl', hostile.jxl, 'bad.jxl'), null);
      assert.equal(getAssetSize('avif', hostile.avif, 'bad.avif'), null);
      assert.equal(getAssetSize('txt', hostile.malformedAvif, 'bad.txt'), null);

      for (const content of Object.values(hostile)) {
        assert.throws(
          () => getAssetSize('png', content, 'hostile.png'),
          /unsupported|unable|invalid|dimension/i,
        );
      }
      assert.throws(
        () => getAssetSize('ktx', ktx1le.subarray(0, 63), 'truncated.ktx'),
        /KTX 1.*truncated/i,
      );
      assert.throws(
        () => getAssetSize('ktx', ktx2.subarray(0, 79), 'truncated.ktx'),
        /KTX 2.*truncated/i,
      );
      const zeroWidth = Buffer.from(ktx2);
      zeroWidth.writeUInt32LE(0, 20);
      assert.throws(
        () => getAssetSize('ktx', zeroWidth, 'zero.ktx'),
        /dimensions/i,
      );
    }
  },
};

if (process.argv[2] === '--case') {
  await cases[process.argv[3]]();
} else {
  for (const name of Object.keys(cases)) {
    test(`${name} image buffers terminate safely`, () => {
      const result = spawnSync(process.execPath, [filename, '--case', name], {
        cwd: root,
        encoding: 'utf8',
        timeout: 1500,
      });
      assert.notEqual(result.error?.code, 'ETIMEDOUT', `${name} case blocked the event loop`);
      assert.equal(result.status, 0, result.stderr || result.stdout);
    });
  }
}