import type { TaskData } from '../stores/types';
import { assertNever } from './assert-never';

export function statusDotColor(agent: TaskData['agent']): string {
  if (!agent) return 'bg-muted/40';
  switch (agent.state) {
    case 'running':
      return 'bg-warning motion-safe:animate-pulse';
    case 'idle':
      return 'bg-success';
    case 'error':
      return 'bg-danger';
    default:
      return assertNever(agent.state);
  }
}
