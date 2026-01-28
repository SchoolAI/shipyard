/**
 * RFC 6455 reserves 4000-4999 for application-specific close codes.
 */
export const EPOCH_CLOSE_CODES = {
  EPOCH_TOO_OLD: 4100,
} as const;

export type EpochCloseCode = (typeof EPOCH_CLOSE_CODES)[keyof typeof EPOCH_CLOSE_CODES];

export const EPOCH_CLOSE_REASONS = {
  [EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]: 'epoch_too_old',
} as const;

export type EpochCloseReason = (typeof EPOCH_CLOSE_REASONS)[EpochCloseCode];

export const DEFAULT_EPOCH = 1;

export function getEpochFromMetadata(metadata: { epoch?: number }): number {
  return metadata.epoch ?? DEFAULT_EPOCH;
}

export function isEpochValid(epoch: number, minimumEpoch: number): boolean {
  return epoch >= minimumEpoch;
}
