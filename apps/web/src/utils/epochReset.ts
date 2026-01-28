import { EPOCH_CLOSE_CODES, EPOCH_CLOSE_REASONS } from '@shipyard/schema';

export function isEpochRejection(code: number, reason?: string): boolean {
  return (
    code === EPOCH_CLOSE_CODES.EPOCH_TOO_OLD ||
    reason === EPOCH_CLOSE_REASONS[EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]
  );
}

async function deletePlanDatabase(planId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(planId);

    const timeout = setTimeout(() => {
      resolve(false);
    }, 5000);

    request.onsuccess = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    request.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    request.onblocked = () => {
      /* Keep waiting - will eventually succeed or timeout */
    };
  });
}

export async function handleEpochRejection(planId: string): Promise<void> {
  await deletePlanDatabase(planId);
  window.location.reload();
}
