import { Spinner } from '@heroui/react';
import { SignalingClient } from '@shipyard/session/client';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth-store';
import {
  exchangeCodeForToken,
  getOAuthParamsFromUrl,
  isTokenExpired,
  validateOAuthState,
} from '../utils/github-oauth';
import { LoginPage } from './login-page';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const token = useAuthStore((s) => s.token);
  const isExchanging = useAuthStore((s) => s.isExchanging);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const setExchanging = useAuthStore((s) => s.setExchanging);
  const setError = useAuthStore((s) => s.setError);
  const hasExchangedRef = useRef(false);

  useEffect(() => {
    if (hasExchangedRef.current) return;

    const currentToken = useAuthStore.getState().token;
    if (currentToken && isTokenExpired(currentToken)) {
      logout();
      return;
    }

    const params = getOAuthParamsFromUrl();
    if (!params) return;

    /** Clean URL immediately to prevent re-processing on re-render */
    history.replaceState(null, '', window.location.pathname);

    if (!validateOAuthState(params.state)) {
      setError('Authentication failed. Please try again.');
      return;
    }

    hasExchangedRef.current = true;

    const sessionServerUrl = import.meta.env.VITE_SESSION_SERVER_URL;
    if (typeof sessionServerUrl !== 'string' || !sessionServerUrl) {
      setError('Session server URL not configured');
      return;
    }

    setExchanging(true);
    const redirectUri = window.location.origin + window.location.pathname;

    exchangeCodeForToken(params.code, redirectUri, sessionServerUrl)
      .then(({ token: newToken, user }) => {
        login(newToken, user);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'Authentication failed. Please try again.';
        setError(message);
      });
  }, [login, logout, setExchanging, setError]);

  useEffect(() => {
    const { token: currentToken, isExchanging: exchanging } = useAuthStore.getState();
    if (!currentToken || exchanging || isTokenExpired(currentToken)) return;
    if (getOAuthParamsFromUrl()) return;

    const sessionServerUrl = import.meta.env.VITE_SESSION_SERVER_URL;
    if (typeof sessionServerUrl !== 'string' || !sessionServerUrl) return;

    const client = new SignalingClient(sessionServerUrl);
    let cancelled = false;

    client
      .verify(currentToken)
      .then((result) => {
        if (cancelled) return;
        if (currentToken !== useAuthStore.getState().token) return;
        if (!result.valid) {
          logout();
        }
      })
      .catch((err: unknown) => {
        // biome-ignore lint/suspicious/noConsole: surface schema/network errors in dev tools
        console.warn('[AuthGate] Token verify failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [logout]);

  if (isExchanging) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-background gap-4">
        <Spinner size="lg" aria-label="Completing sign in" />
        <p className="text-sm text-muted">Completing sign in...</p>
      </div>
    );
  }

  if (!token || isTokenExpired(token)) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
