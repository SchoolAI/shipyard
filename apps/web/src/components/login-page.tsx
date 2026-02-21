import { Button, Spinner } from '@heroui/react';
import { AlertCircle, Github } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { buildGitHubAuthorizeUrl } from '../utils/github-oauth';

export function LoginPage() {
  const error = useAuthStore((s) => s.error);
  const isExchanging = useAuthStore((s) => s.isExchanging);

  function handleSignIn() {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    if (typeof clientId !== 'string' || !clientId) {
      useAuthStore.getState().setError('GitHub OAuth is not configured');
      return;
    }
    const redirectUri = `${window.location.origin}/`;
    window.location.href = buildGitHubAuthorizeUrl(clientId, redirectUri);
  }

  return (
    <div className="flex items-center justify-center h-dvh bg-background">
      <main className="flex flex-col items-center gap-6 px-4">
        <img
          src="/icon.svg"
          alt=""
          className="w-16 h-16 sm:w-20 sm:h-20 object-contain opacity-80"
        />

        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Sign in to Shipyard</h1>

        {isExchanging ? (
          <div className="flex items-center gap-3 text-muted">
            <Spinner size="sm" aria-label="Completing sign in" />
            <span className="text-sm">Completing sign in...</span>
          </div>
        ) : (
          <Button variant="primary" onPress={handleSignIn} className="gap-2">
            <Github className="w-4 h-4" />
            Sign in with GitHub
          </Button>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 text-danger text-sm max-w-sm text-center"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </main>
    </div>
  );
}
