import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  providers: string[];
}

export interface AuthStore {
  token: string | null;
  user: AuthUser | null;
  isExchanging: boolean;
  error: string | null;

  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setExchanging: (exchanging: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        token: null,
        user: null,
        isExchanging: false,
        error: null,

        login: (token, user) =>
          set({ token, user, error: null, isExchanging: false }, undefined, 'auth/login'),

        logout: () =>
          set(
            { token: null, user: null, error: null, isExchanging: false },
            undefined,
            'auth/logout'
          ),

        setExchanging: (exchanging) =>
          set({ isExchanging: exchanging }, undefined, 'auth/setExchanging'),

        setError: (error) => set({ error, isExchanging: false }, undefined, 'auth/setError'),
      }),
      {
        name: 'shipyard-auth',
        partialize: (state) => ({
          token: state.token,
          user: state.user,
        }),
      }
    ),
    { name: 'AuthStore', store: 'auth' }
  )
);
