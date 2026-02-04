import { Card, Spinner } from '@heroui/react';
import type { AuthState } from '@/hooks/use-github-auth';

interface GitHubAuthOverlayProps {
  authState: AuthState;
}

export function GitHubAuthOverlay({ authState }: GitHubAuthOverlayProps) {
  if (authState.status === 'idle') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-sm mx-4">
        <Card.Content className="p-6">
          <AuthContent authState={authState} />
        </Card.Content>
      </Card>
    </div>
  );
}

function AuthContent({ authState }: { authState: AuthState }) {
  switch (authState.status) {
    case 'idle':
      return null;
    case 'exchanging_token':
      return <ExchangingState />;
    case 'success':
      return <SuccessState />;
    case 'error':
      return <ErrorState message={authState.message} />;
    default: {
      const _exhaustive: never = authState;
      throw new Error(`Unhandled auth state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function ExchangingState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" />
      <p className="text-center text-foreground">Completing sign in...</p>
    </div>
  );
}

function SuccessState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
        <CheckIcon className="w-8 h-8 text-success" />
      </div>
      <p className="text-center text-foreground font-medium">Successfully signed in!</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
        <XIcon className="w-8 h-8 text-danger" />
      </div>
      <p className="text-center text-danger">{message}</p>
      <p className="text-center text-muted-foreground text-sm">Please try signing in again.</p>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      role="img"
      aria-label="Success checkmark"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      role="img"
      aria-label="Error indicator"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
