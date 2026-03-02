export const MAX_RETRIES = 10;

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;

export function getNextRetryDelay(retryCount: number): number {
  const delay = BASE_DELAY_MS * 2 ** retryCount;
  return Math.min(delay, MAX_DELAY_MS);
}
