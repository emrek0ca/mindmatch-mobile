import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Heart, Info, MapPin, MessageCircle, X } from './icons';

import type { Profile } from '../api/types';
import { useTheme, createThemedStyles } from '../theme/tokens';
import { Avatar, ProtectedImage } from './ui';
import { SoftSurface } from './SoftSurface';
import { MoodMascot } from './MoodMascot';

export function DiscoveryCard({ person, photos, caption, mood, onProfile, onSkip, onMessage, onConnect, label, connected, disabled, busy }: {
  person: Profile; photos: { id: string; mediaAssetId: string; isPrimary: boolean }[];
  caption?: string; mood?: number; onProfile: () => void; onSkip: () => void; onMessage: () => void; onConnect: () => void;
  label: string; connected: boolean; disabled: boolean; busy: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  const { height } = useWindowDimensions();
  const [photoIndex, setPhotoIndex] = useState(0);
  const ordered = [...photos].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const index = Math.min(photoIndex, Math.max(0, ordered.length - 1));
  return <View style={styles.card}>
    <View style={[styles.photo, { height: Math.max(280, Math.min(520, height * .49)) }]}>
      {ordered[index]?.mediaAssetId ? <ProtectedImage mediaAssetId={ordered[index].mediaAssetId} style={StyleSheet.absoluteFill} /> : <View style={styles.placeholder}><Avatar name={person.displayName} size={128} /><Text style={styles.placeholderName}>{person.displayName}</Text></View>}
      {ordered.length > 1 ? <>
        <View style={styles.photoNavigation}><Pressable accessibilityRole="button" accessibilityLabel="Önceki fotoğraf" style={styles.photoHalf} onPress={() => setPhotoIndex((index + ordered.length - 1) % ordered.length)} /><Pressable accessibilityRole="button" accessibilityLabel="Sonraki fotoğraf" style={styles.photoHalf} onPress={() => setPhotoIndex((index + 1) % ordered.length)} /></View>
        <View pointerEvents="none" style={styles.progress}>{ordered.map((photo, i) => <View key={photo.id} style={[styles.progressItem, i === index && styles.progressActive]} />)}</View>
      </> : null}
      <View pointerEvents="none"  style={styles.shade} />
      <Pressable accessibilityRole="button" accessibilityLabel="Profili görüntüle" onPress={onProfile} style={styles.info}><Info size={19} color="#FFFFFF" /></Pressable>
      <SoftSurface media animate style={styles.meta}>
        <View style={styles.identity}><Text numberOfLines={1} style={styles.name}>{person.displayName}<Text style={styles.age}>{person.age ? `  ${person.age}` : ''}</Text></Text>{mood ? <View accessibilityLabel="Benzer ruh hâli"><MoodMascot mood={mood} size={44} /></View> : null}</View>
        {person.city ? <View style={styles.city}><MapPin size={13} color="#FFFFFF" /><Text style={styles.cityText}>{person.city}</Text></View> : null}
        {caption ? <Text numberOfLines={2} style={styles.caption}>{caption}</Text> : null}
      </SoftSurface>
    </View>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Bu kişiyi geç" disabled={busy} onPress={onSkip} style={({ pressed }) => [styles.round, pressed && styles.pressed]}><X size={25} color={colors.ink} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onConnect} style={({ pressed }) => [styles.connect, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>{busy ? <ActivityIndicator color={colors.onAccent} /> : <>{connected ? <MessageCircle size={19} color={colors.onAccent} /> : <Heart size={19} color={colors.onAccent} fill={colors.onAccent} />}<Text numberOfLines={1} style={styles.connectText}>{label}</Text></>}</Pressable>
      {!connected ? <Pressable accessibilityRole="button" accessibilityLabel="Mesaj isteği gönder" disabled={busy} onPress={onMessage} style={({ pressed }) => [styles.round, pressed && styles.pressed]}><MessageCircle size={21} color={colors.ink} /></Pressable> : null}
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => ({
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  photo: { width: '100%', backgroundColor: colors.paleViolet }, placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }, placeholderName: { color: colors.muted, fontSize: 16 },
  photoNavigation: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' }, photoHalf: { flex: 1 },
  progress: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', gap: 4 }, progressItem: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF66' }, progressActive: { backgroundColor: '#FFFFFF' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%', backgroundColor: '#0000001A' }, info: { position: 'absolute', top: 24, right: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#00000026' },
  meta: { position: 'absolute', left: 20, right: 20, bottom: 16, gap: 8, padding: 16, borderRadius: 24 }, identity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, name: { color: '#FFFFFF', flex: 1, fontSize: 27, fontWeight: '700', letterSpacing: -.7 }, age: { fontSize: 22, fontWeight: '400' },
  city: { flexDirection: 'row', gap: 4, alignItems: 'center' }, cityText: { color: '#FFFFFFE8', fontSize: 12 }, caption: { color: '#FFFFFF', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16 }, round: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center' },
  connect: { flex: 1, minHeight: 52, paddingHorizontal: 12, borderRadius: 26, backgroundColor: colors.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, connectText: { color: colors.onAccent, fontWeight: '600', fontSize: 14 }, disabled: { opacity: .5 }, pressed: { transform: [{ scale: .97 }], opacity: .8 },
}));
