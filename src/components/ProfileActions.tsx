import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { X } from './icons';
import { callApi, chatApi, discoveryApi, matchApi } from '../api/mindmatch';
import type { Profile } from '../api/types';
import { useSession } from '../state/session';
import { createThemedStyles, useTheme } from '../theme/tokens';
import { Button } from './ui';

export function useProfileActions() {
  const qc = useQueryClient();
  const userId = useSession(state => state.user?.userId);
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations });
  const matches = useQuery({ queryKey: ['matches'], queryFn: matchApi.list });
  const [target, setTarget] = useState<Profile | null>(null);
  const [text, setText] = useState('');
  const sentRequests = useQuery<string[]>({ queryKey: ['sent-message-requests', userId], queryFn: async () => [], enabled: false, initialData: [] });
  const requested = new Set(sentRequests.data);
  const related = (person: Profile) => {
    const all = matches.data?.filter(match => match.requesterId === person.userId || match.receiverId === person.userId) ?? [];
    return all.find(match => match.status === 2) ?? all.find(match => match.status === 1);
  };
  const conversationId = (person: Profile) => conversations.data?.find(item => item.otherUserId === person.userId)?.id || (related(person)?.status === 2 ? related(person)?.conversationId : undefined);
  const openChat = async (person: Profile) => {
    const id = conversationId(person);
    if (!id) return;
    if (!conversations.data?.some(item => item.id === id)) await chatApi.restoreConversation(id);
    router.push({ pathname: '/conversation/[id]', params: { id, userId: person.userId, name: person.displayName } });
  };
  // Public profiles redact request/call preferences. The API enforces the recipient's actual permissions.
  const send = useMutation({
    mutationFn: async () => {
      if (!target || !text.trim()) throw new Error('Mesaj isteği gönderilemiyor.');
      return { message: await chatApi.sendRequest(target.userId, text.trim()), userId: target.userId };
    },
    onSuccess: value => { qc.setQueryData<string[]>(['sent-message-requests', userId], previous => [...new Set([...(previous ?? []), value.userId])]); setTarget(null); setText(''); void qc.invalidateQueries({ queryKey: ['conversations'] }); },
    onError: error => Alert.alert('İstek gönderilemedi', error.message),
  });
  const message = useMutation({ mutationFn: async (person: Profile) => {
    if (conversationId(person)) { await openChat(person); return; }
    if (requested.has(person.userId)) { Alert.alert('İstek gönderildi', 'Kabul edildiğinde sohbet açılacak.'); return; }
    setText(''); setTarget(person);
  }, onError: error => Alert.alert('Sohbet açılamadı', error.message) });
  const heart = useMutation({ mutationFn: async (person: Profile) => {
    const match = related(person);
    if (match?.status === 2 || conversationId(person)) { await openChat(person); return; }
    if (match?.status === 1) {
      if (match.receiverId !== userId) return;
      await matchApi.accept(match.id);
    } else await discoveryApi.match(person.userId);
    await Promise.all([qc.invalidateQueries({ queryKey: ['matches'] }), qc.invalidateQueries({ queryKey: ['conversations'] })]);
  }, onError: error => Alert.alert('Eşleşme tamamlanamadı', error.message) });
  const call = useMutation({ mutationFn: async (person: Profile) => {
    if (Constants.executionEnvironment === 'storeClient' && Platform.OS !== 'web') { Alert.alert('Canlı arama', 'Aramalar MindMatch iOS uygulamasında kullanılabilir.'); return; }
    const id = conversationId(person);
    if (!id) { Alert.alert('Önce sohbet', 'Aramak için mesaj isteğinin veya eşleşmenin kabul edilmesi gerekiyor.'); return; }
    const value = await callApi.start(id, 1);
    router.push({ pathname: '/call/[id]', params: { id: value.id, type: '1', name: person.displayName } });
  }, onError: error => Alert.alert('Arama başlatılamadı', error.message) });
  return { target, text, setText, close: () => { if (!send.isPending) setTarget(null); }, send, message, heart, call, related, conversationId, requested,
    busy: message.isPending || heart.isPending || call.isPending, ready: conversations.isSuccess && matches.isSuccess };
}
export function MessageRequestSheet({ actions }: { actions: ReturnType<typeof useProfileActions> }) {
  const styles = useStyles(); const { colors } = useTheme();
  return <Modal visible={Boolean(actions.target)} transparent animationType="slide" onRequestClose={actions.close}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable accessibilityLabel="Kapat" style={styles.dismiss} onPress={actions.close} />
      <View style={styles.sheet}>
        <View style={styles.heading}><Text numberOfLines={1} style={styles.name}>{actions.target?.displayName}</Text><Pressable accessibilityLabel="Kapat" onPress={actions.close} style={styles.close}><X color={colors.ink} size={22} /></Pressable></View>
        <TextInput value={actions.text} onChangeText={actions.setText} editable={!actions.send.isPending} multiline maxLength={400} placeholder="Bir merhaba…" placeholderTextColor={colors.faint} accessibilityLabel="Mesaj isteği" style={styles.input} />
        <Button title="Mesaj isteği gönder" loading={actions.send.isPending} disabled={!actions.text.trim()} onPress={() => actions.send.mutate()} />
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const useStyles = createThemedStyles(colors => ({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }, dismiss: { flex: 1 },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 16 }, name: { flex: 1, color: colors.ink, fontSize: 20, fontWeight: '600' }, close: { padding: 10 },
  input: { color: colors.ink, backgroundColor: colors.surface, borderRadius: 20, padding: 16, fontSize: 16, minHeight: 104, maxHeight: 180, textAlignVertical: 'top' },
}));
