const state = globalThis as typeof globalThis & {
  __navimediSessionGeneration?: number;
};

export class StaleSessionRequestError extends Error {
  constructor() {
    super("This request belongs to an ended session.");
    this.name = "StaleSessionRequestError";
  }
}

function generation(): number {
  return state.__navimediSessionGeneration ?? 1;
}

export function sessionGeneration(): number {
  return generation();
}

export function assertSession(
  _sessionKey: string | null,
  expectedGeneration?: number,
): number {
  if (expectedGeneration !== undefined && expectedGeneration !== generation()) {
    throw new StaleSessionRequestError();
  }
  return generation();
}

export function notifySessionEnd(_reason: string): void {
  state.__navimediSessionGeneration = generation() + 1;
}