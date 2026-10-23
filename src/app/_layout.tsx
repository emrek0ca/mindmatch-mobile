import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useSession } from '../state/session';
import { useTheme } from '../theme/tokens';
import { Loading, Screen } from '../components/ui';
import { useAppearance } from '../state/appearance';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } } });
export default function RootLayout() {
  const { colors, isDark } = useTheme();

  const initialize = useSession(s => s.initialize);
  const initializeAppearance = useAppearance(state => state.initialize);
  useEffect(() => { void initializeAppearance(); }, [initializeAppearance]);
  const userId = useSession(s => s.user?.userId);
  const previousUserId = useRef<string | undefined>(undefined);
  const [booted, setBooted] = useState(false);
  useEffect(() => { initialize().finally(() => setBooted(true)); }, [initialize]);
  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) queryClient.clear();
    previousUserId.current = userId;
  }, [userId]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => { subscription.remove(); focusManager.setFocused(undefined); };
  }, []);
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}><QueryClientProvider client={queryClient}><StatusBar style={isDark ? 'light' : 'dark'} />{!booted ? <Screen><Loading label="MindMatch hazırlanıyor" /></Screen> : <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'fade_from_bottom' }}><Stack.Screen name="index" /><Stack.Screen name="(tabs)" /><Stack.Screen name="mood" options={{ presentation: 'modal' }} /><Stack.Screen name="my-reports" options={{ presentation: 'modal' }} /><Stack.Screen name="conversation/[id]" options={{ animation: 'slide_from_right' }} /><Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal' }} /><Stack.Screen name="premium" options={{ presentation: 'modal' }} /><Stack.Screen name="requests" options={{ presentation: 'modal' }} /><Stack.Screen name="settings" options={{ presentation: 'modal' }} /><Stack.Screen name="security" options={{ presentation: 'modal' }} /><Stack.Screen name="blocked" options={{ presentation: 'modal' }} /><Stack.Screen name="admin" options={{ presentation: 'modal' }} /><Stack.Screen name="report" options={{ presentation: 'modal' }} /><Stack.Screen name="recover" options={{ presentation: 'modal' }} /><Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal' }} /></Stack>}</QueryClientProvider></GestureHandlerRootView>;
}

