import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, Heart, Info, MessageCircle, Phone, Sparkles } from '../../components/icons';

import { discoveryApi, profileApi } from '../../api/mindmatch';
import type { Profile } from '../../api/types';
import { Avatar, Button, Empty, ProtectedImage, Screen } from '../../components/ui';
import { MoodMascot, moodOption } from '../../components/MoodMascot';
import { MessageRequestSheet, useProfileActions } from '../../components/ProfileActions';
import { createThemedStyles, useTheme } from '../../theme/tokens';
import { SoftSurface } from '../../components/SoftSurface';
import { useSession } from '../../state/session';

export default function MatchesScreen() {
  const { colors } = useTheme();
  const styles = useStyles(); const actions = useProfileActions();
  const [height, setHeight] = useState(0);
  const mood = useQuery({ queryKey: ['my-mood'], queryFn: discoveryApi.mood, retry: false, staleTime: 60_000 });
  const activeMood = mood.data && !mood.data.isExpired ? mood.data.mood : undefined;
  const people = useInfiniteQuery({ queryKey: ['discovery', 'mood-pages', activeMood, mood.data?.desiredConversation], initialPageParam: 1, enabled: Boolean(activeMood),
    queryFn: ({ pageParam }) => discoveryApi.list(pageParam, 24), getNextPageParam: page => page.hasMore ? page.page + 1 : undefined, staleTime: 60_000 });
  const profiles = useMemo(() => [...new Map((people.data?.pages.flatMap(page => page.items) ?? []).map(person => [person.userId, person])).values()]
    .filter(person => person.isProfileVisible && person.discoveryReasons?.some(reason => reason.startsWith('Ruh hâli'))), [people.data]);
  const loading = mood.isLoading || (Boolean(activeMood) && people.isLoading);
  return <Screen>
    <View style={styles.viewport} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
      {height > 0 && profiles.length ? <FlatList key={Math.round(height)} data={profiles} keyExtractor={person => person.userId} pagingEnabled decelerationRate="fast" showsVerticalScrollIndicator={false}
        initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        onEndReachedThreshold={1} onEndReached={() => { if (people.hasNextPage && !people.isFetching) void people.fetchNextPage(); }}
        renderItem={({ item }) => <MatchPortrait person={item} height={height} mood={activeMood!} actions={actions} />}
        ListFooterComponent={people.hasNextPage ? <View style={[styles.empty, { height }]}><Button title="Keşfetmeye devam et" loading={people.isFetchingNextPage} onPress={() => { if (!people.isFetching) void people.fetchNextPage(); }} /></View> : null}
        refreshing={people.isRefetching && !people.isFetchingNextPage} onRefresh={() => { void people.refetch(); }}
      /> : <View style={styles.empty}><MoodMascot mood={activeMood || 9} size={140} /><Empty icon={<Sparkles size={24} color={colors.violetDark} />} detail="" title={loading ? 'Yükleniyor…' : !activeMood ? 'Bugün nasıl hissediyorsun?' : people.isError ? 'Profiller yüklenemedi' : 'Aynı histe biri henüz yok'}
        action={!loading ? <Button title={!activeMood ? 'Ruh hâlini seç' : people.isError ? 'Tekrar dene' : people.hasNextPage ? 'Keşfetmeye devam et' : 'Yenile'} loading={people.isFetching} onPress={() => { if (!activeMood) router.push('/mood'); else if (people.hasNextPage && !people.isError) void people.fetchNextPage(); else void people.refetch(); }} /> : undefined} /></View>}
    </View>
    <MessageRequestSheet actions={actions} />
  </Screen>;
}

function MatchPortrait({ person, height, mood, actions }: { person: Profile; height: number; mood: number; actions: ReturnType<typeof useProfileActions> }) {
  const styles = useStyles(); const { colors } = useTheme();
  const userId = useSession(state => state.user?.userId);
  const [index, setIndex] = useState(0);
  const photos = useQuery({ queryKey: ['profile-photos', person.userId], queryFn: () => profileApi.photos(person.userId), staleTime: 300_000 });
  const ordered = useMemo(() => [...(photos.data ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)), [photos.data]);
  const photo = ordered[Math.min(index, Math.max(0, ordered.length - 1))];
  const match = actions.related(person);
  const connected = Boolean(actions.conversationId(person) || match?.status === 2);
  const outgoing = match?.status === 1 && match.requesterId === userId;
  const disabled = !actions.ready || actions.busy;
  return <View style={[styles.portrait, { height }]}>
    {photo ? <ProtectedImage mediaAssetId={photo.mediaAssetId} style={StyleSheet.absoluteFill} /> : <View style={styles.fallback}><Avatar name={person.displayName} size={140} /></View>}
    {ordered.length > 1 ? <View style={styles.photoTaps}><Pressable accessibilityLabel="Önceki fotoğraf" style={styles.half} onPress={() => setIndex((index + ordered.length - 1) % ordered.length)} /><Pressable accessibilityLabel="Sonraki fotoğraf" style={styles.half} onPress={() => setIndex((index + 1) % ordered.length)} /></View> : null}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#00000020' }]} />
    <View pointerEvents="box-none" style={styles.top}>
      <Pressable accessibilityLabel="Ruh hâlini değiştir" onPress={() => router.push('/mood')} style={styles.mood}><MoodMascot mood={mood} size={36} /><Text style={styles.moodText}>{moodOption(mood).label}</Text></Pressable>
      <Pressable accessibilityLabel="Profili görüntüle" onPress={() => router.push({ pathname: '/user/[id]', params: { id: person.userId } })} style={styles.info}><Info color="#FFFFFF" size={22} /></Pressable>
    </View>
    {ordered.length > 1 ? <View pointerEvents="none" style={styles.progress}>{ordered.map((item, i) => <View key={item.id} style={[styles.segment, i === index && styles.segmentActive]} />)}</View> : null}
    <SoftSurface media animate style={styles.bottom}>
      <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: person.userId } })}><Text style={styles.name}>{person.displayName}{person.age ? <Text style={styles.age}>  {person.age}</Text> : null}</Text>{person.city ? <Text style={styles.city}>{person.city}</Text> : null}</Pressable>
      {person.bio ? <Text numberOfLines={2} style={styles.bio}>{person.bio}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={connected ? 'Sohbeti aç' : outgoing ? 'Eşleşme isteği gönderildi' : match?.status === 1 ? 'Eşleşmeyi kabul et' : 'Eşleşme isteği gönder'} disabled={disabled || outgoing} onPress={() => actions.heart.mutate(person)} style={[styles.round, styles.heart, (disabled || outgoing) && styles.disabled]}>{outgoing ? <Check size={26} color={colors.onAccent} /> : <Heart size={26} color={colors.onAccent} fill={connected ? colors.onAccent : 'transparent'} />}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sesli ara" disabled={disabled} onPress={() => actions.call.mutate(person)} style={[styles.round, disabled && styles.disabled]}><Phone size={23} color="#FFFFFF" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={connected ? 'Mesaj gönder' : 'Mesaj isteği gönder'} disabled={disabled || (!connected && actions.requested.has(person.userId))} onPress={() => actions.message.mutate(person)} style={[styles.message, (disabled || (!connected && actions.requested.has(person.userId))) && styles.disabled]}><MessageCircle size={22} color="#FFFFFF" /><Text style={styles.messageText}>{connected ? 'Mesaj' : actions.requested.has(person.userId) ? 'Gönderildi' : 'Mesaj isteği'}</Text></Pressable>
      </View>
    </SoftSurface>
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  viewport: { flex: 1 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, portrait: { width: '100%', backgroundColor: colors.night }, fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  photoTaps: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' }, half: { flex: 1 }, top: { position: 'absolute', left: 20, right: 20, top: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mood: { flexDirection: 'row', alignItems: 'center', paddingRight: 14, paddingLeft: 4, backgroundColor: '#00000055', borderRadius: 24, gap: 4 }, moodText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' }, info: { padding: 12, backgroundColor: '#00000033', borderRadius: 24 },
  progress: { position: 'absolute', top: 8, left: 20, right: 20, flexDirection: 'row', gap: 4 }, segment: { height: 2, flex: 1, backgroundColor: '#FFFFFF55' }, segmentActive: { backgroundColor: '#FFFFFF' },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 10, padding: 14, borderRadius: 24 }, name: { color: '#FFFFFF', fontSize: 30, fontWeight: '600', letterSpacing: -.7 }, age: { fontWeight: '400', fontSize: 25 }, city: { color: '#FFFFFFCC', fontSize: 14, marginTop: 4 }, bio: { color: '#FFFFFFDD', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }, round: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF25', alignItems: 'center', justifyContent: 'center' }, heart: { backgroundColor: colors.violet }, message: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 24, backgroundColor: '#FFFFFF25', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 }, messageText: { flexShrink: 1, color: '#FFFFFF', fontSize: 11, fontWeight: '600' }, disabled: { opacity: .45 },
}));
