import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Heart, MessageCircle } from '../components/icons';
import { chatApi, matchApi } from '../api/mindmatch';
import { Avatar, Button, Card, Empty, Loading, Screen, Title } from '../components/ui';
import { useTheme, createThemedStyles } from '../theme/tokens';

export default function RequestsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const qc = useQueryClient();
  const matches = useQuery({ queryKey: ['matches', 'requests'], queryFn: matchApi.requests, refetchInterval: 30_000 });
  const messages = useQuery({ queryKey: ['message-requests'], queryFn: chatApi.incoming, refetchInterval: 30_000 });
  const peopleIds = useMemo(() => [...new Set([...(matches.data ?? []).map(x => x.requesterId), ...(messages.data ?? []).map(x => x.senderId)])], [matches.data, messages.data]);
  const people = useQueries({ queries: peopleIds.map(userId => ({ queryKey: ['profile', userId], queryFn: () => chatApi.profile(userId) })) });
  const profiles = new Map(peopleIds.map((id, index) => [id, people[index]?.data]));
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['matches'] }), qc.invalidateQueries({ queryKey: ['message-requests'] }), qc.invalidateQueries({ queryKey: ['conversations'] })]); };
  const acceptMatch = useMutation({ mutationFn: matchApi.accept, onSuccess: async match => { await refresh(); const conversations = await qc.fetchQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations }); const conversation = conversations.find(item => item.otherUserId === match.requesterId); if (conversation) router.push({ pathname: '/conversation/[id]', params: { id: conversation.id, userId: match.requesterId } }); }, onError: error => Alert.alert('İstek kabul edilemedi', error.message) });
  const rejectMatch = useMutation({ mutationFn: matchApi.reject, onSuccess: refresh, onError: error => Alert.alert('İstek reddedilemedi', error.message) });
  const acceptMessage = useMutation({ mutationFn: chatApi.acceptMessageRequest, onSuccess: (_result, conversationId) => { const request = messages.data?.find(item => item.conversationId === conversationId); refresh(); router.push({ pathname: '/conversation/[id]', params: { id: conversationId, userId: request?.senderId ?? '' } }); }, onError: error => Alert.alert('İstek kabul edilemedi', error.message) });
  const rejectMessage = useMutation({ mutationFn: chatApi.rejectMessageRequest, onSuccess: refresh, onError: error => Alert.alert('İstek reddedilemedi', error.message) });
  if (matches.isLoading || messages.isLoading) return <Screen><Loading label="İstekler yükleniyor" /></Screen>;
  return <Screen scroll style={styles.screen}>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ArrowLeft size={19} color={colors.ink} /></Pressable>
    <Title eyebrow="YENİ BAĞLANTILAR" title="İstekler" subtitle="Gelen istekleri burada yanıtla." />
    <Text style={styles.section}>Eşleşme istekleri</Text>
    {matches.data?.length ? matches.data.map(request => {
      const person = profiles.get(request.requesterId);
      return <Card key={request.id} style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/user/[id]', params: { id: request.requesterId } })} style={styles.person}><Avatar name={person?.displayName ?? 'MindMatch'} size={48} /><View style={styles.copy}><Text style={styles.name}>{person?.displayName ?? 'Yeni bağlantı'}</Text><Text style={styles.detail}>Seninle tanışmak istiyor</Text></View><Heart size={17} color={colors.coral} /></Pressable>
        <View style={styles.actions}><Button title="Reddet" variant="outline" onPress={() => rejectMatch.mutate(request.id)} style={styles.flex} /><Button title="Kabul et ve sohbete geç" onPress={() => acceptMatch.mutate(request.id)} loading={acceptMatch.isPending && acceptMatch.variables === request.id} style={styles.flex} /></View>
      </Card>;
    }) : <Text style={styles.empty}>Bekleyen eşleşme isteği yok.</Text>}
    <Text style={styles.section}>Mesaj istekleri</Text>
    {messages.data?.length ? messages.data.map(request => {
      const person = profiles.get(request.senderId);
      return <Card key={request.conversationId} style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/user/[id]', params: { id: request.senderId } })} style={styles.person}><Avatar name={person?.displayName ?? 'MindMatch'} size={48} /><View style={styles.copy}><Text style={styles.name}>{person?.displayName ?? 'Yeni bağlantı'}</Text><Text numberOfLines={2} style={styles.detail}>{request.initialMessage || 'Sana mesaj isteği gönderdi.'}</Text></View><MessageCircle size={17} color={colors.violetDark} /></Pressable>
        <View style={styles.actions}><Button title="Reddet" variant="outline" onPress={() => rejectMessage.mutate(request.conversationId)} style={styles.flex} /><Button title="Kabul et ve sohbete geç" onPress={() => acceptMessage.mutate(request.conversationId)} loading={acceptMessage.isPending && acceptMessage.variables === request.conversationId} style={styles.flex} /></View>
      </Card>;
    }) : <Text style={styles.empty}>Bekleyen mesaj isteği yok.</Text>}
    {!matches.data?.length && !messages.data?.length ? <Card style={styles.card}><Empty icon={<Heart size={24} color={colors.violetDark} />} title="İstekler burada görünecek" detail="Yeni eşleşme veya mesaj isteğini anında yanıtlayabilirsin." /></Card> : null}
  </Screen>;
}

const useStyles = createThemedStyles(colors => ({ screen: { paddingHorizontal: 20, paddingTop: 10 }, back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderColor: colors.line, borderWidth: 1, backgroundColor: colors.surface }, section: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 14, marginBottom: 9 }, card: { padding: 14, marginBottom: 9 }, person: { flexDirection: 'row', alignItems: 'center', gap: 11 }, copy: { flex: 1 }, name: { fontSize: 13, color: colors.ink, fontWeight: '700' }, detail: { fontSize: 10, color: colors.muted, marginTop: 4, lineHeight: 15 }, actions: { flexDirection: 'row', gap: 8, marginTop: 13 }, flex: { flex: 1 }, empty: { fontSize: 11, color: colors.muted, marginBottom: 10, paddingLeft: 3 } }));
