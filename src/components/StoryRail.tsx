import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueries, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus } from './icons';
import { profileApi } from '../api/mindmatch';
import type { Story } from '../api/types';
import { useTheme, createThemedStyles } from '../theme/tokens';
import { Avatar } from './ui';

export function StoryRail({ stories, onAdd }: { stories: Story[]; onAdd: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();

  const mine = useQuery({ queryKey: ['my-profile'], queryFn: profileApi.mine });
  const myPhotos = useQuery({ queryKey: ['my-photos'], queryFn: () => profileApi.photos() });
  const owners = useMemo(() => [...new Set(stories.map(story => story.userId))].filter(id => id !== mine.data?.userId).slice(0, 10), [stories, mine.data?.userId]);
  const profiles = useQueries({ queries: owners.map(id => ({ queryKey: ['profile', id], queryFn: () => profileApi.get(id), staleTime: 300_000 })) });
  const photos = useQueries({ queries: owners.map(id => ({ queryKey: ['profile-photos', id], queryFn: () => profileApi.photos(id), staleTime: 300_000 })) });
  const myPrimary = myPhotos.data?.find(photo => photo.isPrimary) ?? myPhotos.data?.[0];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
    <Pressable accessibilityRole="button" accessibilityLabel="Hikâye ekle" onPress={onAdd} style={styles.person}>
      <View style={styles.addRing}><Avatar name={mine.data?.displayName || 'Sen'} mediaAssetId={myPrimary?.mediaAssetId} size={54} /><View style={styles.plus}><Plus size={12} color={colors.onAccent} /></View></View>
      <Text style={styles.label}>Hikâyen</Text>
    </Pressable>
    {owners.map((id, index) => {
      const group = stories.filter(story => story.userId === id);
      const photo = photos[index]?.data?.find(item => item.isPrimary) ?? photos[index]?.data?.[0];
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${profiles[index]?.data?.displayName || 'Kullanıcı'} hikâyesi`} onPress={() => router.push({ pathname: '/story/[id]', params: { id: (group.find(story => !story.hasViewed) ?? group[0]).id, userId: id } })} style={styles.person}>
        <View style={[styles.ring, group.every(story => story.hasViewed) && styles.viewed]}><Avatar name={profiles[index]?.data?.displayName || 'MM'} mediaAssetId={photo?.mediaAssetId} size={54} /></View>
        <Text numberOfLines={1} style={styles.label}>{profiles[index]?.data?.displayName?.split(' ')[0] || 'Hikâye'}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const useStyles = createThemedStyles(colors => ({
  rail: { gap: 16, paddingVertical: 8 }, person: { width: 64, gap: 6, alignItems: 'center' },
  ring: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  viewed: { borderColor: colors.line, borderWidth: 1 }, addRing: { width: 62, height: 62, borderRadius: 31, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  plus: { position: 'absolute', right: 0, bottom: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.violet, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.muted, fontSize: 12, fontWeight: '500', maxWidth: 64 },
}));
