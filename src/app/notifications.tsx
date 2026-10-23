import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Heart, MessageCircle, Sparkles, UserCheck, X, RefreshCw } from '../components/icons';
import { callApi, chatApi, matchApi, notificationApi } from '../api/mindmatch';
import type { Notification } from '../api/types';
import { Avatar, Button, Empty, Loading, Screen } from '../components/ui';
import { useTheme, createThemedStyles } from '../theme/tokens';

export default function NotificationsPage({ tab = false }: { tab?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();

  const qc = useQueryClient();
  const notifications = useInfiniteQuery({
    queryKey: ['notifications', 'pages'],
    initialPageParam: undefined as { createdAtUtc: string; id: string } | undefined,
    queryFn: ({ pageParam }) => notificationApi.list(pageParam),
    getNextPageParam: last => last.hasMore && last.nextBeforeCreatedAtUtc && last.nextBeforeId
      ? { createdAtUtc: last.nextBeforeCreatedAtUtc, id: last.nextBeforeId }
      : undefined,
    refetchInterval: 60_000,
  });
  const matches = useQuery({ queryKey: ['matches', 'requests'], queryFn: matchApi.requests, refetchInterval: 30_000 });
  const messageRequests = useQuery({ queryKey: ['message-requests'], queryFn: chatApi.incoming, refetchInterval: 30_000 });

  const personIds = useMemo(() => [
    ...new Set([
      ...(matches.data ?? []).map(request => request.requesterId),
      ...(messageRequests.data ?? []).map(request => request.senderId),
    ]),
  ], [matches.data, messageRequests.data]);

  const people = useQueries({
    queries: personIds.map(userId => ({ queryKey: ['profile', userId], queryFn: () => chatApi.profile(userId) })),
  });
  const profileById = new Map(personIds.map((id, index) => [id, people[index]?.data]));

  const refreshRequests = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['matches'] }),
      qc.invalidateQueries({ queryKey: ['message-requests'] }),
      qc.invalidateQueries({ queryKey: ['conversations'] }),
      qc.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };

  const acceptMatch = useMutation({
    mutationFn: matchApi.accept,
    onSuccess: async match => {
      await refreshRequests();
      const conversations = await qc.fetchQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations });
      const conversation = conversations.find(item => item.otherUserId === match.requesterId);
      if (conversation) router.push({ pathname: '/conversation/[id]', params: { id: conversation.id, userId: match.requesterId } });
    },
    onError: error => Alert.alert('İstek kabul edilemedi', error.message),
  });

  const rejectMatch = useMutation({
    mutationFn: matchApi.reject,
    onSuccess: refreshRequests,
    onError: error => Alert.alert('İstek reddedilemedi', error.message),
  });

  const acceptMessage = useMutation({
    mutationFn: chatApi.acceptMessageRequest,
    onSuccess: (_result, conversationId) => {
      const request = messageRequests.data?.find(item => item.conversationId === conversationId);
      refreshRequests();
      router.push({ pathname: '/conversation/[id]', params: { id: conversationId, userId: request?.senderId ?? '' } });
    },
    onError: error => Alert.alert('Mesaj isteği kabul edilemedi', error.message),
  });

  const rejectMessage = useMutation({
    mutationFn: chatApi.rejectMessageRequest,
    onSuccess: refreshRequests,
    onError: error => Alert.alert('Mesaj isteği reddedilemedi', error.message),
  });

  const markAll = useMutation({
    mutationFn: notificationApi.readAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: error => Alert.alert('Bildirimler güncellenemedi', error.message),
  });

  const markOne = useMutation({
    mutationFn: notificationApi.read,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: error => Alert.alert('Bildirim güncellenemedi', error.message),
  });

  async function openNotification(item: Notification) {
    if (!item.readAtUtc) markOne.mutate(item.id);
    if (item.type === 1 || item.type === 3) return;
    if (item.type === 7) { router.push('/my-reports'); return; }
    if (!item.referenceId) return;
    try {
      if (item.type === 2) {
        const match = (await matchApi.list()).find(value => value.id === item.referenceId);
        if (!match?.conversationId) return;
        const conversation = await chatApi.conversation(match.conversationId);
        router.push({ pathname: '/conversation/[id]', params: { id: conversation.id, userId: conversation.otherUserId } });
      } else if (item.type === 4 || item.type === 5) {
        const conversation = await chatApi.conversation(item.referenceId);
        router.push({ pathname: '/conversation/[id]', params: { id: conversation.id, userId: conversation.otherUserId } });
      } else if (item.type === 6) {
        const call = await callApi.status(item.referenceId);
        if (call.status === 1 || call.status === 2) router.push({ pathname: '/call/[id]', params: { id: call.id, type: String(call.type), incoming: 'true' } });
      }
    } catch (error) {
      Alert.alert('İçerik açılamadı', error instanceof Error ? error.message : 'Tekrar dene.');
    }
  }

  if (notifications.isLoading || matches.isLoading || messageRequests.isLoading) {
    return <Screen><Loading label="Bildirimler yükleniyor" /></Screen>;
  }
  if (notifications.error && !notifications.data) return <Screen><Empty icon={<RefreshCw size={24} color={colors.violetDark} />} title="Bildirimler yüklenemedi" detail={notifications.error.message} action={<Button title="Tekrar dene" onPress={() => { void notifications.refetch(); void matches.refetch(); void messageRequests.refetch(); }} />} /></Screen>;

  const items = notifications.data?.pages.flatMap(page => page.items) ?? [];
  const pendingRequestsCount = (matches.data?.length ?? 0) + (messageRequests.data?.length ?? 0);

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.topHeader}>
        {!tab && <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.topTitle}>Bildirimler</Text>
        </View>
        {items.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tüm bildirimleri okundu işaretle"
            onPress={() => markAll.mutate()}
            disabled={markAll.isPending}
            style={styles.markAllBtn}
          >
            <Check size={19} color={colors.violetDark} />
          </Pressable>
        )}
      </View>

      {pendingRequestsCount > 0 ? (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>İstekler</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingRequestsCount}</Text>
            </View>
          </View>

          {matches.data?.map(request => {
            const person = profileById.get(request.requesterId);
            return (
              <View key={request.id} style={styles.requestCard}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: request.requesterId } })}
                  style={styles.person}
                >
                  <Avatar name={person?.displayName ?? 'MindMatch'} size={50} />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>{person?.displayName ?? 'Yeni Bağlantı'}</Text>
                    <Text style={styles.personDetail}>Eşleşmek istiyor</Text>
                  </View>
                  <View style={styles.requestIconBadge}>
                    <Heart size={16} color={colors.coral} fill={colors.coral} />
                  </View>
                </Pressable>
                <View style={styles.buttons}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Eşleşme isteğini reddet" disabled={rejectMatch.isPending || acceptMatch.isPending} onPress={() => rejectMatch.mutate(request.id)} style={styles.rejectAction}>
                    {rejectMatch.isPending && rejectMatch.variables === request.id ? <ActivityIndicator color={colors.muted} /> : <X size={20} color={colors.muted} />}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Eşleşme isteğini kabul et" disabled={rejectMatch.isPending || acceptMatch.isPending} onPress={() => acceptMatch.mutate(request.id)} style={styles.acceptAction}>
                    {acceptMatch.isPending && acceptMatch.variables === request.id ? <ActivityIndicator color={colors.onAccent} /> : <Check size={21} color={colors.onAccent} />}
                  </Pressable>
                </View>
              </View>
            );
          })}

          {messageRequests.data?.map(request => {
            const person = profileById.get(request.senderId);
            return (
              <View key={request.conversationId} style={styles.requestCard}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: request.senderId } })}
                  style={styles.person}
                >
                  <Avatar name={person?.displayName ?? 'MindMatch'} size={50} />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>{person?.displayName ?? 'Yeni Bağlantı'}</Text>
                    <Text numberOfLines={1} style={styles.personDetail}>{request.initialMessage || 'Mesaj isteği'}</Text>
                  </View>
                  <View style={styles.requestIconBadgeMessage}>
                    <MessageCircle size={16} color={colors.violetDark} />
                  </View>
                </Pressable>
                <View style={styles.buttons}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Mesaj isteğini reddet" disabled={rejectMessage.isPending || acceptMessage.isPending} onPress={() => rejectMessage.mutate(request.conversationId)} style={styles.rejectAction}>
                    {rejectMessage.isPending && rejectMessage.variables === request.conversationId ? <ActivityIndicator color={colors.muted} /> : <X size={20} color={colors.muted} />}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Mesaj isteğini kabul et" disabled={rejectMessage.isPending || acceptMessage.isPending} onPress={() => acceptMessage.mutate(request.conversationId)} style={styles.acceptAction}>
                    {acceptMessage.isPending && acceptMessage.variables === request.conversationId ? <ActivityIndicator color={colors.onAccent} /> : <Check size={21} color={colors.onAccent} />}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>Son hareketler</Text>
        {items.length ? (
          items.map(item => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => { void openNotification(item); }}
            >
              <View style={[styles.notice, !item.readAtUtc && styles.unread]}>
                <View style={[styles.icon, !item.readAtUtc && styles.unreadIcon]}>
                  {item.type === 1 ? (
                    <Heart color={colors.coral} size={18} fill={colors.coral} />
                  ) : item.type === 2 ? (
                    <UserCheck color={colors.green} size={18} />
                  ) : item.type === 3 || item.type === 4 || item.type === 5 ? (
                    <MessageCircle color={colors.violetDark} size={18} />
                  ) : (
                    <Sparkles color={colors.violetDark} size={18} />
                  )}
                </View>
                <View style={styles.noticeCopy}>
                  <Text numberOfLines={1} style={styles.noticeTitle}>{item.title}</Text>
                  <Text numberOfLines={1} style={styles.noticeBody}>{item.body}</Text>
                </View>
                {!item.readAtUtc && <View style={styles.dot} />}
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Empty
              icon={<Sparkles size={24} color={colors.violetDark} />}
              title={pendingRequestsCount > 0 ? 'İsteklerin hazır' : 'Henüz yeni bildirim yok'}
              detail={pendingRequestsCount > 0 ? 'İstekleri yanıtla.' : 'Yeni hareketler burada görünür.'}
            />
          </View>
        )}
        {notifications.hasNextPage ? <Pressable accessibilityRole="button" disabled={notifications.isFetchingNextPage} onPress={() => { void notifications.fetchNextPage(); }} style={styles.more}><Text style={styles.moreText}>{notifications.isFetchingNextPage ? 'Yükleniyor…' : 'Önceki bildirimler'}</Text></Pressable> : null}
      </View>
    </Screen>
  );
}

const useStyles = createThemedStyles(colors => ({
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, moreText: { color: colors.violetDark, fontSize: 12, fontWeight: '600' },
  screen: { paddingHorizontal: 20, paddingTop: 14 },
  topHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  topKicker: { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', color: colors.violetDark, textTransform: 'uppercase' },
  topTitle: { fontSize: 30, fontWeight: '600', letterSpacing: -0.8, color: colors.ink, marginTop: 1 },
  markAllBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleViolet },
  action: { fontSize: 11, color: colors.violetDark, fontWeight: '600' },
  sectionWrap: { marginBottom: 26 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: colors.ink, letterSpacing: -0.3, marginBottom: 10 },
  badge: { backgroundColor: colors.coral, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '600' },
  requestCard: { padding: 15, marginBottom: 9, borderRadius: 24, backgroundColor: colors.surface },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  personCopy: { flex: 1 },
  personName: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  personDetail: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3 },
  requestIconBadge: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.paleCoral, alignItems: 'center', justifyContent: 'center' },
  requestIconBadgeMessage: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.paleViolet, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'flex-end' },
  rejectAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  acceptAction: { width: 54, height: 44, borderRadius: 22, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  notice: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  unread: { backgroundColor: colors.paleViolet, borderRadius: 19, paddingHorizontal: 11, borderBottomWidth: 0 },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  unreadIcon: { backgroundColor: colors.paleViolet },
  noticeCopy: { flex: 1 },
  noticeTitle: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  noticeBody: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3 },
  date: { fontSize: 10, color: colors.faint, marginTop: 6, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral, marginTop: 4 },
  emptyCard: { padding: 20, borderRadius: 18 },
}));
