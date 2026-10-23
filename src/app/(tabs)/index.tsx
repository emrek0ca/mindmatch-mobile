import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MessageCircle, Search, Shuffle, RefreshCw } from '../../components/icons';
import { discoveryApi, profileApi } from '../../api/mindmatch';
import type { Profile } from '../../api/types';
import { Avatar, Button, Empty, Screen } from '../../components/ui';
import { MessageRequestSheet, useProfileActions } from '../../components/ProfileActions';
import { createThemedStyles, useTheme } from '../../theme/tokens';

export default function DiscoverScreen() {
  const styles = useStyles(); const { colors } = useTheme(); const actions = useProfileActions();
  const [search, setSearch] = useState('');
  const needle = useDeferredValue(search).trim().toLocaleLowerCase('tr-TR');
  const [shuffle, setShuffle] = useState(() => Date.now() | 0);
  const people = useInfiniteQuery({ queryKey: ['discovery', 'open-profiles'], initialPageParam: 1,
    queryFn: ({ pageParam }) => discoveryApi.list(pageParam, 24), getNextPageParam: page => page.hasMore ? page.page + 1 : undefined, staleTime: 60_000 });
  const profiles = useMemo(() => {
    const list = [...new Map((people.data?.pages.flatMap(page => page.items) ?? []).map(person => [person.userId, person])).values()]
      .filter(person => person.isProfileVisible)
      .filter(person => !needle || [person.displayName, person.nickname, person.city].some(value => value?.toLocaleLowerCase('tr-TR').includes(needle)));
    if (!shuffle) return list;
    const rank = (id: string) => [...id].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), shuffle);
    return list.sort((a, b) => rank(a.userId) - rank(b.userId));
  }, [people.data, needle, shuffle]);
  return <Screen style={styles.page}>
    <View style={styles.header}><Text style={styles.title}>Keşfet</Text><Pressable accessibilityRole="button" accessibilityLabel="Kişileri karıştır" style={styles.icon} onPress={() => setShuffle(Date.now() | 0)}><Shuffle size={21} color={colors.violetDark} /></Pressable></View>
    <View style={styles.search}><Search size={18} color={colors.faint} /><TextInput value={search} onChangeText={setSearch} placeholder="Kişi ara" placeholderTextColor={colors.faint} style={styles.input} accessibilityLabel="Kişi ara" /></View>
    <FlatList style={styles.list} data={profiles} keyExtractor={person => person.userId} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      initialNumToRender={10} maxToRenderPerBatch={6} windowSize={5} contentContainerStyle={styles.content}
      refreshing={people.isRefetching && !people.isFetchingNextPage} onRefresh={() => { void people.refetch(); }}
      onEndReachedThreshold={.5} onEndReached={() => { if (people.hasNextPage && !people.isFetching) void people.fetchNextPage(); }}
      renderItem={({ item }) => <OpenProfileRow person={item} requested={actions.requested.has(item.userId) && !actions.conversationId(item)} ready={actions.ready && !actions.busy} onMessage={() => actions.message.mutate(item)} />}
      ListEmptyComponent={<Empty icon={<RefreshCw size={24} color={colors.violetDark} />} detail="" title={people.isLoading ? 'Yükleniyor…' : people.isError ? 'Kişiler yüklenemedi' : 'Şimdilik kimse yok'} action={people.isError || people.hasNextPage ? <Button title={people.isError ? 'Tekrar dene' : 'Daha fazla kişi'} loading={people.isFetching} onPress={() => { if (people.isError) void people.refetch(); else void people.fetchNextPage(); }} /> : undefined} />}
      ListFooterComponent={people.hasNextPage ? <Button title="Daha fazla kişi" variant="ghost" loading={people.isFetchingNextPage} onPress={() => { if (!people.isFetching) void people.fetchNextPage(); }} /> : null} />
    <MessageRequestSheet actions={actions} />
  </Screen>;
}
function OpenProfileRow({ person, onMessage, requested, ready }: { person: Profile; onMessage: () => void; requested: boolean; ready: boolean }) {
  const styles = useStyles(); const { colors } = useTheme();
  const photos = useQuery({ queryKey: ['profile-photos', person.userId], queryFn: () => profileApi.photos(person.userId), staleTime: 300_000 });
  const photo = photos.data?.find(item => item.isPrimary) ?? photos.data?.[0];
  return <View style={styles.row}>
    <Pressable accessibilityLabel="Profili görüntüle" onPress={() => router.push({ pathname: '/user/[id]', params: { id: person.userId } })}><Avatar name={person.displayName} mediaAssetId={photo?.mediaAssetId} size={60} /></Pressable>
    <Pressable style={styles.person} onPress={onMessage} disabled={!ready}><Text numberOfLines={1} style={styles.name}>{person.displayName}</Text><Text numberOfLines={1} style={styles.detail}>{requested ? 'İstek gönderildi' : person.bio || person.city || `@${person.nickname}`}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={requested ? 'Mesaj isteği gönderildi' : 'Mesaj gönder'} disabled={!ready || requested} style={[styles.message, (!ready || requested) && styles.disabled]} onPress={onMessage}><MessageCircle size={21} color={colors.violetDark} /></Pressable>
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  page: { paddingHorizontal: 20 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }, title: { color: colors.ink, fontSize: 28, fontWeight: '600', letterSpacing: -.8 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, search: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, borderRadius: 20, marginBottom: 12 }, input: { flex: 1, height: 48, paddingHorizontal: 12, color: colors.ink, fontSize: 15 },
  list: { flex: 1 }, content: { paddingBottom: 24 }, row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 88 }, person: { flex: 1, minWidth: 0, gap: 6, paddingVertical: 12 }, name: { color: colors.ink, fontSize: 16, fontWeight: '600' }, detail: { color: colors.muted, fontSize: 13 }, message: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.paleViolet }, disabled: { opacity: .45 }, loading: { color: colors.muted, textAlign: 'center', padding: 20 },
}));
