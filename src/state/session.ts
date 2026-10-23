import { create } from 'zustand';
import { authApi } from '../api/mindmatch';
import { ApiError, onSessionExpired, sessionTokens } from '../api/client';
import type { AuthResponse, Me } from '../api/types';

type SessionState = { user: Me | null; ready: boolean; busy: boolean; error: string | null; initialize: () => Promise<void>; signIn: (email: string, password: string) => Promise<void>; reactivate: (email: string, password: string) => Promise<void>; signUp: (email: string, password: string, name: string, nickname?: string) => Promise<void>; signOut: () => Promise<void>; setUser: (user: Me) => void };
let authOperation = 0;
async function saveAuth(auth: AuthResponse, operation: number) {
  if (operation !== authOperation) throw new ApiError('Oturum işlemi iptal edildi.', 499);
  await sessionTokens.save(auth.accessToken, auth.refreshToken);
  if (operation !== authOperation) throw new ApiError('Oturum işlemi iptal edildi.', 499);
  return authApi.me();
}
export const useSession = create<SessionState>((set) => ({
  user: null, ready: false, busy: false, error: null,
  setUser: (user) => set({ user }),
  initialize: async () => {
    const operation = ++authOperation;
    try {
      if (await sessionTokens.access()) {
        const user = await authApi.me(AbortSignal.timeout(6000));
        if (operation === authOperation) set({ user });
      }
    } catch (error) {
      if (operation === authOperation && error instanceof ApiError && error.status === 401) await sessionTokens.clear();
    } finally { set({ ready: true }); }
  },
  signIn: async (email, password) => {
    const operation = ++authOperation;
    set({ busy: true, error: null });
    try {
      const user = await saveAuth(await authApi.login(email, password), operation);
      if (operation === authOperation) set({ user });
    } catch (error) {
      if (operation === authOperation) set({ error: error instanceof Error ? error.message : 'Giriş yapılamadı.' });
      throw error;
    } finally { if (operation === authOperation) set({ busy: false }); }
  },
  reactivate: async (email, password) => {
    const operation = ++authOperation;
    set({ busy: true, error: null });
    try {
      const user = await saveAuth(await authApi.reactivate(email, password), operation);
      if (operation === authOperation) set({ user, error: null });
    } catch (error) {
      if (operation === authOperation) set({ error: error instanceof Error ? error.message : 'Hesap etkinleştirilemedi.' });
      throw error;
    } finally { if (operation === authOperation) set({ busy: false }); }
  },
  signUp: async (email, password, name, nickname) => {
    const operation = ++authOperation;
    set({ busy: true, error: null });
    try {
      const user = await saveAuth(await authApi.register(email, password, name, nickname), operation);
      if (operation === authOperation) set({ user });
    } catch (error) {
      if (operation === authOperation) set({ error: error instanceof Error ? error.message : 'Kayıt oluşturulamadı.' });
      throw error;
    } finally { if (operation === authOperation) set({ busy: false }); }
  },
  signOut: async () => {
    const operation = ++authOperation;
    set({ user: null, error: null, busy: false });
    const [refresh, access] = await Promise.all([sessionTokens.refresh(), sessionTokens.access()]);
    if (operation !== authOperation) return;
    const revoke = refresh ? authApi.logout(refresh, access).catch(() => {}) : Promise.resolve();
    await sessionTokens.clear();
    await revoke;
  }

}));

onSessionExpired(() => {
  authOperation++;
  useSession.setState({ user: null, busy: false, error: 'Oturumun sona erdi. Yeniden giriş yap.' });
});

