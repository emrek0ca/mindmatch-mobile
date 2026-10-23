import { useEffect, useRef, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { Bell, Compass, Crown, MessageCircle, Sparkles, UserRound } from '../../components/icons';
import { Alert, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useSession } from '../../state/session';
import { useTheme, createThemedStyles } from '../../theme/tokens';
import { callApi, chatApi, matchApi } from '../../api/mindmatch';
import { connectCalls, connectMessages, onMessagesReconnected, stopCalls, stopMessages } from '../../realtime/hub';

const icons = { index: Compass, matches: Sparkles, stories: Sparkles, chats: MessageCircle, notifications: Bell, profile: UserRound } as const;
type IncomingPrompt = { kind: 'match'; id: string; userId: string } | { kind: 'message'; conversationId: string; userId: string };

export default function TabLayout() {
  const { colors } = useTheme();
  const styles = useStyles();

  const user = useSession(s => s.user);
  const queryClient = useQueryClient();
  const { data: incomingMatches } = useQuery({ queryKey: ['matches', 'requests'], queryFn: matchApi.requests, enabled: !!user, refetchInterval: 30_000 });
  const { data: incomingMessages } = useQuery({ queryKey: ['message-requests'], queryFn: chatApi.incoming, enabled: !!user, refetchInterval: 30_000 });
  const [prompt, setPrompt] = useState<IncomingPrompt | null>(null);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState('');
  const seenRequests = useRef(new Set<string>());

  useEffect(() => {
    if (prompt || !user) return;
    const match = incomingMatches?.find(request => !seenRequests.current.has(`match:${request.id}`));
    if (match) {
      seenRequests.current.add(`match:${match.id}`);
      setPrompt({ kind: 'match', id: match.id, userId: match.requesterId });
      return;
    }
    const message = incomingMessages?.find(request => !seenRequests.current.has(`message:${request.conversationId}`));
    if (message) {
      seenRequests.current.add(`message:${message.conversationId}`);
      setPrompt({ kind: 'message', conversationId: message.conversationId, userId: message.senderId });
    }
  }, [prompt, incomingMatches, incomingMessages, user]);

  async function answerRequest(accept: boolean) {
    if (!prompt || promptBusy) return;
    const activePrompt = prompt;
    setPromptBusy(true);
    setPromptError('');
    try {
      if (activePrompt.kind === 'match') {
        if (accept) {
          const match = await matchApi.accept(activePrompt.id);
          await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-preview'] });
          const conversations = await queryClient.fetchQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations });
          const conversation = conversations.find(item => item.otherUserId === match.requesterId);
          if (conversation) router.push({ pathname: '/conversation/[id]', params: { id: conversation.id, userId: activePrompt.userId } });
        } else await matchApi.reject(activePrompt.id);
      } else {
        if (accept) {
          await chatApi.acceptMessageRequest(activePrompt.conversationId);
          router.push({ pathname: '/conversation/[id]', params: { id: activePrompt.conversationId, userId: activePrompt.userId } });
        } else await chatApi.rejectMessageRequest(activePrompt.conversationId);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['matches'] }),
        queryClient.invalidateQueries({ queryKey: ['message-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      setPrompt(null);
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : 'İstek yanıtlanamadı. Tekrar dene.');
    } finally {
      setPromptBusy(false);
    }
  }

  useEffect(() => {
    if (!user) { router.replace('/'); return; }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeCalls: (() => void) | undefined;
    const refresh = () => {
      if (!active) return;
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['message-requests'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-preview'] });
    };
    const offReconnect = onMessagesReconnected(refresh);
    const foreground = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      void connectMessages();
      if (Constants.executionEnvironment !== 'storeClient') void connectCalls();
      refresh();
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });
    connectMessages().then(hub => {
      if (!hub || !active) return;
      const refreshEvents = ['NotificationReceived', 'MatchCreated', 'MatchAccepted', 'MatchRejected', 'MatchEnded', 'MessageRequestReceived', 'MessageRequestAccepted', 'MessageRequestRejected', 'MessageCreated', 'MessageDeleted', 'MessageHidden', 'MessageStatusChanged', 'ConversationUpdated'];
      refreshEvents.forEach(event => hub.on(event, refresh));
      unsubscribe = () => { refreshEvents.forEach(event => hub.off(event, refresh)); };
    });
    if (Constants.executionEnvironment !== 'storeClient') connectCalls().then(hub => {
      if (!hub || !active) return;
      const incoming = (call: { id?: string; type?: number }) => {
        if (!call.id) return;
        Alert.alert('Gelen arama', 'Bir MindMatch kullanıcısı seni arıyor.', [
          { text: 'Reddet', style: 'cancel', onPress: () => callApi.reject(call.id!).catch(() => {}) },
          { text: 'Yanıtla', onPress: () => router.push({ pathname: '/call/[id]', params: { id: call.id!, type: String(call.type || 1), incoming: 'true' } }) }
        ]);
      };
      hub.on('CallIncoming', incoming);
      unsubscribeCalls = () => { hub.off('CallIncoming', incoming); };
    });
    return () => { active = false; foreground.remove(); offReconnect(); unsubscribe?.(); unsubscribeCalls?.(); void stopMessages(); void stopCalls(); };
  }, [user, queryClient]);

  return (
    <>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: colors.violet,
          tabBarInactiveTintColor: colors.faint,
          tabBarStyle: styles.bar,
          tabBarItemStyle: styles.item,
          tabBarIcon: ({ focused, color }) => {
            const Icon = icons[route.name as keyof typeof icons];
            const iconColor = color;

            return (
              <View style={[styles.iconWrap, focused && styles.iconActive]}>
                <Icon size={21} color={iconColor} strokeWidth={focused ? 2.5 : 2} />
              </View>
            );
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Keşfet' }} />
        <Tabs.Screen name="matches" options={{ title: 'Eşleşme' }} />
        <Tabs.Screen name="stories" options={{ title: 'Hikâyeler', href: null }} />
        <Tabs.Screen name="chats" options={{ title: 'Sohbetler' }} />
        <Tabs.Screen name="notifications" options={{ title: 'Bildirimler' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
      </Tabs>

      <Modal visible={Boolean(prompt)} transparent animationType="fade" onRequestClose={() => setPrompt(null)}>
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <View style={styles.promptIcon}><Crown color={colors.violetDark} size={21} /></View>
            <Text style={styles.promptEyebrow}>YENİ İSTEK</Text>
            <Text style={styles.promptTitle}>{prompt?.kind === 'match' ? 'Eşleşme isteği geldi' : 'Mesaj isteği geldi'}</Text>
            <Text style={styles.promptBody}>
              {prompt?.kind === 'match' ? 'Bir kullanıcı seninle eşleşmek istiyor. İstersen profilini incele, sonra yanıtla.' : 'Sana yeni bir mesaj isteği gönderildi.'}
            </Text>
            {promptError ? <Text style={styles.promptError}>{promptError}</Text> : null}
            <Pressable accessibilityRole="button" disabled={promptBusy} onPress={() => { if (prompt) router.push({ pathname: '/user/[id]', params: { id: prompt.userId } }); setPrompt(null); }} style={styles.profileAction}>
              <Text style={styles.profileActionText}>Profili görüntüle</Text>
            </Pressable>
            <View style={styles.promptButtons}>
              <Pressable accessibilityRole="button" disabled={promptBusy} onPress={() => answerRequest(false)} style={[styles.promptButton, styles.rejectButton]}>
                <Text style={styles.rejectText}>{promptBusy ? 'Bekle…' : 'Reddet'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={promptBusy} onPress={() => answerRequest(true)} style={[styles.promptButton, styles.acceptButton]}>
                <Text style={styles.acceptText}>{promptBusy ? 'Bekle…' : 'Kabul et'}</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" disabled={promptBusy} onPress={() => setPrompt(null)} style={styles.laterAction}>
              <Text style={styles.laterText}>Daha sonra yanıtla</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const useStyles = createThemedStyles(colors => ({
  bar: { height: 68, paddingTop: 7, paddingBottom: 7, backgroundColor: colors.canvas, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, elevation: 12 },
  item: { height: 52 },
  iconWrap: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, position: 'relative' },
  iconActive: { backgroundColor: colors.paleViolet },
  iconActiveVip: { backgroundColor: colors.surface },
  promptBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 22 },
  promptCard: { width: '100%', maxWidth: 390, padding: 22, backgroundColor: colors.surface, borderRadius: 26, alignItems: 'center', shadowColor: colors.night, shadowOpacity: 0.18, shadowRadius: 24, elevation: 18 },
  promptIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: colors.paleViolet, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  promptEyebrow: { fontSize: 9, letterSpacing: 1.5, color: colors.violetDark, fontWeight: '700' },
  promptTitle: { fontSize: 21, color: colors.ink, fontWeight: '700', textAlign: 'center', marginTop: 7 },
  promptBody: { fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 15 },
  promptError: { fontSize: 12, color: colors.red, textAlign: 'center', marginBottom: 10 },
  profileAction: { paddingVertical: 9, paddingHorizontal: 15 },
  profileActionText: { color: colors.violetDark, fontSize: 12, fontWeight: '600' },
  promptButtons: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 12 },
  promptButton: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  acceptButton: { backgroundColor: colors.violet },
  rejectText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  acceptText: { color: colors.onAccent, fontSize: 13, fontWeight: '600' },
  laterAction: { paddingVertical: 14, paddingHorizontal: 10 },
  laterText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
}));
