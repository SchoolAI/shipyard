import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentStatusCard, type AgentStatusCardProps } from './agent-status-card';

function renderCard(overrides: Partial<AgentStatusCardProps> = {}) {
  const props: AgentStatusCardProps = {
    status: 'running',
    onStop: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  const result = render(<AgentStatusCard {...props} />);
  return { ...result, props };
}

describe('AgentStatusCard', () => {
  it('renders running state with spinner, working text, and Stop button', () => {
    renderCard({ status: 'running', modelName: 'claude-opus-4' });

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Agent working');
    screen.getByText('Agent working...');
    screen.getByText('claude-opus-4');
    screen.getByText('Stop');
  });

  it('renders failed state with alert text and no Stop button', () => {
    renderCard({ status: 'failed' });

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Agent failed');
    screen.getByText('Agent failed');
    expect(screen.queryByText('Stop')).toBeNull();
  });

  it('calls onStop when Stop button is pressed', () => {
    const { props } = renderCard({ status: 'running' });

    fireEvent.click(screen.getByText('Stop'));

    expect(props.onStop).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when dismiss button is pressed', () => {
    const { props } = renderCard({ status: 'failed' });

    fireEvent.click(screen.getByLabelText('Dismiss agent status'));

    expect(props.onDismiss).toHaveBeenCalledOnce();
  });

  it('disables Stop button and shows Stopping text when isStopping is true', () => {
    renderCard({ status: 'running', isStopping: true });

    screen.getByText('Stopping...');
    const button = screen.getByText('Stopping...').closest('button');
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(screen.queryByText('Stop')).toBeNull();
  });

  it('shows error message in failed state', () => {
    renderCard({ status: 'failed', errorMessage: 'Rate limit exceeded' });

    screen.getByText('Rate limit exceeded');
  });

  it('does not show error row when failed without errorMessage', () => {
    renderCard({ status: 'failed' });

    screen.getByText('Agent failed');
    expect(screen.queryByText('Rate limit exceeded')).toBeNull();
  });
});
