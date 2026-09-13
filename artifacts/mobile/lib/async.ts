export class AsyncOperationTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms.`);
    this.name = "AsyncOperationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Bound an asynchronous operation without pretending that JavaScript can
 * cancel the underlying native or network request. Callers that time out
 * must still preserve their generation/cleanup boundary before starting new
 * work.
 */
export function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = Promise.race([
    Promise.resolve(operation),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new AsyncOperationTimeoutError(operationName, timeoutMs));
      }, timeoutMs);
    }),
  ]);

  return result.finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function isAsyncOperationTimeout(error: unknown): boolean {
  return error instanceof AsyncOperationTimeoutError;
}