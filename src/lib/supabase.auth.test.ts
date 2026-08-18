import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  is_anonymous: boolean;
};

const harness = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const listeners = new Set<(event: string) => void>();
  const state: {
    user: TestUser | null;
    accessToken: string | null;
    recoveryUser: TestUser | null;
  } = {
    user: null,
    accessToken: null,
    recoveryUser: null,
  };

  const session = () => state.user && state.accessToken
    ? { user: state.user, access_token: state.accessToken }
    : null;

  const auth = {
    getSession: vi.fn(async () => ({ data: { session: session() }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    getClaims: vi.fn(async (token: string) => ({
      data: { claims: { is_anonymous: token.startsWith('anonymous-') } },
      error: null,
    })),
    signInAnonymously: vi.fn(async () => {
      state.user = { id: 'anonymous-user-id', is_anonymous: true };
      state.accessToken = 'anonymous-token';
      return { data: { user: state.user, session: session() }, error: null };
    }),
    updateUser: vi.fn(async (attributes: { email?: string; password?: string }) => {
      if (!state.user) return { data: { user: null }, error: new Error('No session') };
      if (attributes.email) {
        state.user = {
          ...state.user,
          email: attributes.email,
          email_confirmed_at: '2026-08-18T08:00:00.000Z',
          is_anonymous: false,
        };
      }
      return { data: { user: state.user }, error: null };
    }),
    refreshSession: vi.fn(async () => {
      state.accessToken = 'permanent-token';
      return { data: { session: session(), user: state.user }, error: null };
    }),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    onAuthStateChange: vi.fn((listener: (event: string) => void) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    exchangeCodeForSession: vi.fn(async () => {
      state.user = state.recoveryUser;
      state.accessToken = 'permanent-recovery-token';
      for (const listener of listeners) listener('PASSWORD_RECOVERY');
      return { data: { session: session(), user: state.user }, error: null };
    }),
    signOut: vi.fn(async () => {
      state.user = null;
      state.accessToken = null;
      return { error: null };
    }),
  };

  return { auth, listeners, state, storage };
});

vi.hoisted(() => {
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
});

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('react-native', () => ({
  Linking: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    getInitialURL: vi.fn(async () => null),
  },
}));
vi.mock('expo-auth-session', () => ({
  makeRedirectUri: vi.fn(() => 'thirtynights-dev://auth/callback'),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: harness.auth })),
}));
vi.mock('@/lib/secureStorage', () => ({
  secureStorage: {
    getItem: vi.fn(async (key: string) => harness.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { harness.storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { harness.storage.delete(key); }),
  },
}));

import {
  completePasswordRecovery,
  ensureAnonymousSession,
  getPasswordRecoveryState,
  handleAuthCallback,
  linkEmailPassword,
  sendPasswordReset,
  subscribeToPasswordRecovery,
} from '@/lib/supabase';

describe('Supabase email authentication lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.storage.clear();
    harness.listeners.clear();
    harness.state.user = { id: 'anonymous-user-id', is_anonymous: true };
    harness.state.accessToken = 'anonymous-token';
    harness.state.recoveryUser = null;
  });

  it('creates a permanent session immediately without changing the anonymous owner id', async () => {
    const user = await linkEmailPassword(' Person@Example.COM ', 'correct horse battery staple');

    expect(harness.auth.updateUser).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'correct horse battery staple',
    });
    expect(harness.auth.refreshSession).toHaveBeenCalledOnce();
    expect(user).toMatchObject({
      id: 'anonymous-user-id',
      email: 'person@example.com',
      is_anonymous: false,
    });
    await expect(ensureAnonymousSession()).resolves.toEqual({
      userId: 'anonymous-user-id',
      email: 'person@example.com',
      state: 'authenticated',
    });
  });

  it('keeps a recovery session fail-closed until the password is saved, then authenticates the same user', async () => {
    const transitions: Array<string | null> = [];
    const unsubscribe = subscribeToPasswordRecovery((state) => transitions.push(state?.step ?? null));
    harness.state.recoveryUser = {
      id: 'recovered-user-id',
      email: 'person@example.com',
      email_confirmed_at: '2026-08-18T08:05:00.000Z',
      is_anonymous: false,
    };

    await expect(sendPasswordReset(' Person@Example.COM ')).resolves.toEqual({
      email: 'person@example.com',
      step: 'email-sent',
    });
    expect(harness.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'person@example.com',
      { redirectTo: 'thirtynights-dev://auth/callback?purpose=password-recovery' },
    );

    const callback = 'thirtynights-dev://auth/callback?purpose=password-recovery&code=one-time-code&sb_flow_id=device-flow';
    await expect(handleAuthCallback(callback)).resolves.toBeNull();
    await expect(getPasswordRecoveryState()).resolves.toEqual({
      email: 'person@example.com',
      step: 'set-password',
    });
    await expect(ensureAnonymousSession()).resolves.toEqual({
      userId: 'recovered-user-id',
      email: 'person@example.com',
      state: 'anonymous',
    });

    const recovered = await completePasswordRecovery('new correct horse battery staple');
    expect(recovered.id).toBe('recovered-user-id');
    await expect(getPasswordRecoveryState()).resolves.toBeNull();
    await expect(ensureAnonymousSession()).resolves.toEqual({
      userId: 'recovered-user-id',
      email: 'person@example.com',
      state: 'authenticated',
    });
    expect(transitions).toEqual(['email-sent', 'set-password', null]);
    unsubscribe();
  });
});
