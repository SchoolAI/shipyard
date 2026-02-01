import { getEpochFromMetadata, isEpochValid } from '@shipyard/schema';
import type { PlatformAdapter } from '../platform.js';
import type { ValidateEpochMessage } from '../types.js';

export function handleValidateEpoch(
  platform: PlatformAdapter,
  ws: unknown,
  message: ValidateEpochMessage,
  minimumEpoch: number
): void {
  const clientEpoch = message.epoch ?? getEpochFromMetadata({});

  if (!isEpochValid(clientEpoch, minimumEpoch)) {
    platform.warn(
      `[ValidateEpoch] Rejecting client for plan ${message.planId}: epoch ${clientEpoch} < minimum ${minimumEpoch}`
    );
    platform.sendMessage(ws, {
      type: 'error',
      error: 'epoch_too_old',
      message: `Plan epoch (${clientEpoch}) is below server minimum (${minimumEpoch})`,
    });
    return;
  }

  platform.debug(`[ValidateEpoch] Client epoch ${clientEpoch} valid for plan ${message.planId}`);
}
