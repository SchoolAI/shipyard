export function formatTime(seconds: number): string {
  if (seconds < 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const OTHER_OPTION_VALUE = '__other__';
export const OTHER_OPTION_LABEL = 'Other (please specify)';

export const NA_OPTION_VALUE = 'n/a';
export const NA_OPTION_LABEL = 'N/A';
