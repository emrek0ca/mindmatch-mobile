import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type AppearancePreference = 'system' | 'light' | 'dark';
const KEY = 'mindmatch.appearance';
let selectionVersion = 0;
let pendingWrite: Promise<void> = Promise.resolve();

export const useAppearance = create<{
  preference: AppearancePreference;
  initialize: () => Promise<void>;
  setPreference: (preference: AppearancePreference) => void;
}>((set) => ({
  preference: 'system',
  initialize: async () => {
    const version = selectionVersion;
    try {
      const value = Platform.OS === 'web'
        ? typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
        : await SecureStore.getItemAsync(KEY);
      if (version === selectionVersion && (value === 'system' || value === 'light' || value === 'dark')) set({ preference: value });
    } catch { /* Follow system appearance if preference storage is unavailable. */ }
  },
  setPreference: preference => {
    selectionVersion++;
    set({ preference });
    pendingWrite = pendingWrite.catch(() => {}).then(async () => {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, preference);
      } else await SecureStore.setItemAsync(KEY, preference);
    }).catch(() => {});
  },
}));
