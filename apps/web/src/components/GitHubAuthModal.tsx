import { Button, Modal, Separator, Spinner } from '@heroui/react';
import type { AuthState } from '@/hooks/useGitHubAuth';
import type { DeviceCodeResponse } from '@/utils/github-device-flow';

interface GitHubAuthModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  authState: AuthState;
  onStartAuth: () => void;
  onCancel: () => void;
}

export function GitHubAuthModal({
  isOpen,
  onOpenChange,
  authState,
  onStartAuth,
  onCancel,
}: GitHubAuthModalProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onCancel();
    }
    onOpenChange(open);
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange} isDismissable={false}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.Header>
            <Modal.Heading>Sign in with GitHub</Modal.Heading>
            <p className="text-sm text-muted-foreground mt-1">
              Authenticate with GitHub to access and collaborate on plans
            </p>
          </Modal.Header>
          <Modal.Body>
            <AuthContent authState={authState} onStartAuth={onStartAuth} />
          </Modal.Body>
          <Modal.Footer>
            {authState.status === 'error' && (
              <Button variant="primary" onPress={onStartAuth}>
                Try Again
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

interface AuthContentProps {
  authState: AuthState;
  onStartAuth: () => void;
}

function AuthContent({ authState, onStartAuth }: AuthContentProps) {
  switch (authState.status) {
    case 'idle':
      return <IdleState onStartAuth={onStartAuth} />;
    case 'awaiting_code':
    case 'polling':
      return <DeviceCodeState deviceCode={authState.deviceCode} />;
    case 'success':
      return <SuccessState />;
    case 'error':
      return <ErrorState message={authState.message} />;
  }
}

interface IdleStateProps {
  onStartAuth: () => void;
}

function IdleState({ onStartAuth }: IdleStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <GitHubLogo className="w-16 h-16 text-foreground" />
      <p className="text-center text-muted-foreground">
        Click below to start the authentication process
      </p>
      <Button variant="primary" onPress={onStartAuth} className="w-full">
        Continue with GitHub
      </Button>
    </div>
  );
}

interface DeviceCodeStateProps {
  deviceCode: DeviceCodeResponse;
}

function DeviceCodeState({ deviceCode }: DeviceCodeStateProps) {
  const handleCopyCode = () => {
    navigator.clipboard.writeText(deviceCode.user_code);
  };

  const handleOpenGitHub = () => {
    window.open(deviceCode.verification_uri, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="text-center">
        <p className="text-muted-foreground mb-2">Go to</p>
        <code className="text-sm bg-surface-elevated px-3 py-1.5 rounded-md font-mono">
          github.com/login/device
        </code>
      </div>

      <Separator />

      <div className="text-center">
        <p className="text-muted-foreground mb-3">Enter this code</p>
        <button
          type="button"
          onClick={handleCopyCode}
          className="group relative cursor-pointer bg-surface-elevated border border-border rounded-lg px-6 py-4 hover:border-primary transition-colors"
          title="Click to copy"
        >
          <span className="font-mono text-2xl font-bold tracking-widest">
            {deviceCode.user_code}
          </span>
          <span className="absolute right-2 top-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            Click to copy
          </span>
        </button>
      </div>

      <Button variant="secondary" onPress={handleOpenGitHub} className="w-full">
        Open GitHub
      </Button>

      <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Spinner size="sm" />
        <span>Waiting for authorization...</span>
      </div>
    </div>
  );
}

function SuccessState() {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
        <CheckIcon className="w-8 h-8 text-success" />
      </div>
      <p className="text-center text-foreground font-medium">Successfully authenticated!</p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
}

function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
        <XIcon className="w-8 h-8 text-danger" />
      </div>
      <p className="text-center text-danger">{message}</p>
    </div>
  );
}

function GitHubLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 98 96"
      fill="currentColor"
      role="img"
      aria-label="GitHub logo"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
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
