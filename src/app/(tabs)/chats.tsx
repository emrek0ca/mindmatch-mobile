import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, MessageCircle, MessageSquarePlus, Search, X, RefreshCw } from '../../components/icons';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, type ViewToken } from 'react-native';
import { chatApi, presenceApi, profileApi, storyApi } from '../../api/mindmatch';
import { Avatar, Button, Empty, Loading, Screen } from '../../components/ui';
import { StoryRail } from '../../components/StoryRail';
import { useTheme, createThemedStyles } from '../../theme/tokens';

export default function ChatsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const queryClient = useQueryClient();
  useFocusEffect(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['conversation-preview'] });
    void queryClient.invalidateQueries({ queryKey: ['stories'] });
  }, [queryClient]));
  const stories = useQuery({ queryKey: ['stories'], queryFn: storyApi.feed, staleTime: 60_000 });
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const viewability = useRef({ itemVisiblePercentThreshold: 10 });
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => setVisibleIds(new Set(viewableItems.map(item => item.key)))).current;
  const list = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations, refetchInterval: 60_000 });
  const people = useQueries({
    queries: (list.data || []).map(c => ({ queryKey: ['profile', c.otherUserId], queryFn: () => chatApi.profile(c.otherUserId), enabled: visibleIds.has(c.id) || Boolean(deferredSearch.trim()), staleTime: 300_000 })),
  });
  const presence = useQueries({
    queries: (list.data || []).map(c => ({ queryKey: ['presence', c.otherUserId], queryFn: () => presenceApi.get(c.otherUserId), enabled: visibleIds.has(c.id), refetchInterval: 60_000 })),
  });
  const photos = useQueries({ queries: (list.data ?? []).map(c => ({ queryKey: ['profile-photos', c.otherUserId], queryFn: () => profileApi.photos(c.otherUserId), enabled: visibleIds.has(c.id), staleTime: 300_000 })) });
  const previews = useQueries({ queries: (list.data ?? []).map(c => ({ queryKey: ['conversation-preview', c.id, c.lastMessageAtUtc], queryFn: () => chatApi.messages(c.id, undefined, 1), enabled: visibleIds.has(c.id) })) });
  const indexByConversationId = useMemo(() => new Map((list.data ?? []).map((conversation, index) => [conversation.id, index])), [list.data]);

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase('tr-TR');
    if (!needle) return list.data ?? [];
    return (list.data ?? []).filter((conversation, index) => {
      const person = people[index]?.data;
      return [person?.displayName, person?.nickname].some(value => value?.toLocaleLowerCase('tr-TR').includes(needle));
    });
  }, [deferredSearch, list.data, people]);

  if (list.isLoading) return <Screen><Loading label="Sohbetler yükleniyor…" /></Screen>;
  if (list.error && !list.data) return <Screen><Empty icon={<RefreshCw size={24} color={colors.violetDark} />} title="Sohbetler yüklenemedi" detail={list.error.message} action={<Button title="Tekrar dene" onPress={() => { void list.refetch(); }} />} /></Screen>;

  return (
    <Screen style={styles.screen}>
      {/* Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.pageTitle}>Sohbetler</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mesaj istekleri"
          style={styles.requestButton}
          onPress={() => router.push('/requests')}
        >
          <MessageSquarePlus size={20} color={colors.violetDark} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Modern Search Bar */}
      <View style={styles.searchBar}>
        <Search size={18} color={colors.faint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Sohbet ara"
          placeholderTextColor={colors.faint}
          style={styles.searchInput}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} style={styles.searchClearBtn}>
            <X size={14} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Conversation List */}
      <FlatList
        data={filtered}
        ListHeaderComponent={<View style={{ marginBottom: 12 }}><StoryRail stories={stories.data ?? []} onAdd={() => router.push({ pathname: '/(tabs)/stories', params: { compose: '1' } })} /></View>}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewability.current}
        refreshing={list.isRefetching}
        onRefresh={() => { void list.refetch(); void stories.refetch(); }}
        keyExtractor={x => x.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const index = indexByConversationId.get(item.id) ?? -1;
          const p = people[index]?.data;
          const status = presence[index]?.data;
          const photo = photos[index]?.data?.find(value => value.isPrimary) ?? photos[index]?.data?.[0];
          const lastMessage = previews[index]?.data?.items[0];
          const isOnline = Boolean(status?.isOnline);
          const statusText = lastMessage?.isDeletedForEveryone ? 'Mesaj silindi' : lastMessage?.type === 3 ? 'Sesli mesaj' : lastMessage?.type === 4 ? 'Video' : lastMessage?.type === 2 ? 'Fotoğraf' : lastMessage?.content || (isOnline ? 'Çevrimiçi' : 'Sohbeti aç');

          return (
            <Pressable
              onPress={() => router.push({
                pathname: '/conversation/[id]',
                params: { id: item.id, userId: item.otherUserId, name: p?.displayName || 'Bağlantı' },
              })}
              style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
            >
              {/* Avatar with Online Glow */}
              <View style={styles.avatarContainer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Profili görüntüle"
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.otherUserId } })}
                >
                  <Avatar name={p?.displayName || 'MM'} mediaAssetId={photo?.mediaAssetId} size={54} />
                </Pressable>
                {isOnline ? <View style={styles.onlineDot} /> : null}
              </View>

              {/* Chat Info */}
              <View style={styles.chatInfo}>
                <View style={styles.chatNameRow}>
                  <Text numberOfLines={1} style={styles.chatName}>
                    {p?.displayName || 'MindMatch kullanıcısı'}
                  </Text>
                  <Text style={styles.chatTime}>
                    {item.lastMessageAtUtc
                      ? new Date(item.lastMessageAtUtc).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
                      : ''}
                  </Text>
                </View>

                <View style={styles.chatSubRow}>
                  <Text numberOfLines={1} style={[styles.chatStatusText, isOnline && styles.chatStatusOnline]}>
                    {statusText}
                  </Text>
                </View>
              </View>

              {/* Chevron */}
              <ChevronRight size={17} color={colors.faint} strokeWidth={2.4} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Empty
              icon={search ? <Search size={24} color={colors.violetDark} /> : <MessageCircle size={24} color={colors.violetDark} />}
              title={search ? 'Eşleşen sohbet yok' : 'Henüz sohbetin yok'}
              detail={search ? 'Başka bir isim ara.' : 'Keşfet ve ilk sohbeti başlat.'}
              action={
                !search ? (
                  <Pressable onPress={() => router.replace('/(tabs)')} style={styles.discoverCTA}>
                    <Text style={styles.discoverCTAText}>Keşfet →</Text>
                  </Pressable>
                ) : undefined
              }
            />
          </View>
        }
      />
    </Screen>
  );
}

const useStyles = createThemedStyles(colors => ({
  screen: {
    paddingHorizontal: 20,
    paddingTop: 15,
    backgroundColor: colors.canvas,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  eyebrow: {
    color: colors.violetDark,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  pageTitle: {
    color: colors.ink,
    fontSize: 31,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 2,
  },
  requestButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search Bar
  searchBar: {
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
  },
  searchClearBtn: {
    padding: 4,
  },

  // List & Row
  listContent: {
    paddingBottom: 124,
    flexGrow: 1,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 2,
  },
  chatRowPressed: {
    opacity: 0.75,
    backgroundColor: colors.paleViolet,
    borderRadius: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  chatInfo: {
    flex: 1,
    minWidth: 0,
  },
  chatNameRow: {
    gap: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  chatTime: {
    fontSize: 10,
    color: colors.faint,
    fontWeight: '600',
  },
  chatSubRow: {
    marginTop: 4,
  },
  chatStatusText: {
    fontSize: 12,
    color: colors.muted,
  },
  chatStatusOnline: {
    color: colors.green,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: colors.line,
    marginLeft: 67,
  },

  // Empty
  emptyCard: {
    marginTop: 24,
    padding: 24,
    borderRadius: 22,
    alignItems: 'center',
  },
  discoverCTA: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.paleViolet,
  },
  discoverCTAText: {
    color: colors.violetDark,
    fontSize: 12,
    fontWeight: '600',
  },
}));
