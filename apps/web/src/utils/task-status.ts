import type { A2ATaskState } from '@shipyard/loro-schema';
import { assertNever } from './assert-never';

export function statusDotColor(status: A2ATaskState): string {
  switch (status) {
    case 'submitted':
      return 'bg-muted/40';
    case 'working':
      return 'bg-warning motion-safe:animate-pulse';
    case 'input-required':
      return 'bg-warning';
    case 'completed':
      return 'bg-success';
    case 'canceled':
      return 'bg-muted/40';
    case 'failed':
      return 'bg-danger';
    default:
      return assertNever(status);
  }
}
