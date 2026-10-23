import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type GestureResponderEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Bell, Camera, ChevronRight, Crown, Globe, ImagePlus, LogOut, Pencil, Plus, Settings, Shield, Star, Trash2, X } from '../../components/icons';

import { discoveryApi, interestApi, mediaApi, profileApi, premiumApi, notificationApi } from '../../api/mindmatch';
import { Avatar, Button, Card, Loading, ProtectedImage, Screen } from '../../components/ui';
import { MoodMascot, moodOption } from '../../components/MoodMascot';
import { ContextMenu, type ContextMenuAction, type MenuAnchor } from '../../components/ContextMenu';
import { useSession } from '../../state/session';
import { useTheme, createThemedStyles } from '../../theme/tokens';
import { normalizeImageForUpload, uploadFailureMessage } from '../../utils/media';


export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const qc = useQueryClient();
  const user = useSession(x => x.user);
  const signOut = useSession(x => x.signOut);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadStage, setPhotoUploadStage] = useState('');
  const [photoUploadError, setPhotoUploadError] = useState('');
  const [photoMenu, setPhotoMenu] = useState<{ anchor: MenuAnchor; photoId?: string; confirmDelete?: boolean } | null>(null);

  const profile = useQuery({ queryKey: ['my-profile'], queryFn: profileApi.mine });
  const photos = useQuery({ queryKey: ['my-photos'], queryFn: () => profileApi.photos() });
  const interests = useQuery({ queryKey: ['interests'], queryFn: interestApi.list });
  const premium = useQuery({ queryKey: ['premium'], queryFn: premiumApi.mine });
  const mood = useQuery({ queryKey: ['my-mood'], queryFn: discoveryApi.mood, retry: false, staleTime: 60_000 });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.list(), refetchInterval: 60_000 });

  const visible = useMutation({
    mutationFn: profileApi.setVisibility,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ['my-profile'] });
    },
    onError: error => Alert.alert('Görünürlük değiştirilemedi', error.message),
  });

  const setPrimary = useMutation({
    mutationFn: profileApi.setPrimaryPhoto,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ['my-photos'] });
    },
    onError: error => Alert.alert('Fotoğraf güncellenemedi', error.message),
  });

  const deletePhoto = useMutation({
    mutationFn: profileApi.deletePhoto,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ['my-photos'] });
    },
    onError: error => Alert.alert('Fotoğraf silinemedi', error.message),
  });

  async function addPhoto(source: 'camera' | 'library' = 'library') {
    if (uploadingPhoto) return;
    setUploadingPhoto(true);
    setPhotoUploadStage('Fotoğraf seçiliyor…');
    setPhotoUploadError('');
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error(source === 'camera' ? 'Kamera izni gerekli.' : 'Galeri izni gerekli.');
      }
      const options = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5] as [number, number],
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const pick =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (pick.canceled) return;

      setPhotoUploadStage('Fotoğraf hazırlanıyor…');
      const image = await normalizeImageForUpload(pick.assets[0].uri);

      setPhotoUploadStage('Sunucuya yükleniyor…');
      const media = await mediaApi.upload(image.uri, image.fileName, image.mimeType, 1);

      setPhotoUploadStage('Kaydediliyor…');
      try {
        await mediaApi.photo(media.id);
      } catch (error) {
        await mediaApi.delete(media.id).catch(() => {});
        throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['my-photos'] }),
        qc.invalidateQueries({ queryKey: ['my-profile'] }),
      ]);
      Alert.alert('Fotoğraf Eklendi', 'Yeni fotoğrafın vitrine başarıyla eklendi.');
    } catch (error) {
      const message = uploadFailureMessage(error);
      setPhotoUploadError(message);
      if (Platform.OS !== 'web') Alert.alert('Fotoğraf yüklenemedi', message);
    } finally {
      setUploadingPhoto(false);
      setPhotoUploadStage('');
    }
  }

  function choosePhoto(event?: GestureResponderEvent) {
    if (Platform.OS === 'web') {
      addPhoto();
      return;
    }
    if (!event) return;
    setPhotoMenu({ anchor: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } });
  }

  function photoActions(photo: { id: string }, event: GestureResponderEvent) {
    setPhotoMenu({ anchor: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }, photoId: photo.id });
  }

  if (profile.isLoading) {
    return (
      <Screen>
        <Loading label="Profil yükleniyor…" />
      </Screen>
    );
  }

  const p = profile.data;
  const photoList = photos.data ?? [];
  const primaryPhoto = photoList.find(photo => photo.isPrimary) ?? photoList[0];
  const isVip = Boolean(premium.data?.isPremium);
  const unreadCount = notifications.data?.items?.filter(x => !x.readAtUtc).length ?? 0;

  const selectedInterestNames = (p?.interestIds ?? [])
    .map(id => interests.data?.find(item => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const selectedPhoto = photoMenu?.photoId ? photoList.find(photo => photo.id === photoMenu.photoId) : undefined;
  const photoMenuActions: ContextMenuAction[] = selectedPhoto && photoMenu?.confirmDelete
    ? [
        { key: 'delete-confirm', label: 'Fotoğrafı sil', destructive: true, icon: <Trash2 size={18} color={colors.red} />, onPress: () => { setPhotoMenu(null); deletePhoto.mutate(selectedPhoto.id); } },
        { key: 'cancel', label: 'Vazgeç', icon: <X size={18} color={colors.muted} />, onPress: () => setPhotoMenu(null) },
      ]
    : selectedPhoto
    ? [
        ...(!selectedPhoto.isPrimary ? [{ key: 'primary', label: 'Ana fotoğraf yap', icon: <Star size={18} color={colors.ink} />, onPress: () => { setPhotoMenu(null); setPrimary.mutate(selectedPhoto.id); } }] : []),
        { key: 'delete', label: 'Fotoğrafı sil', destructive: true, icon: <Trash2 size={18} color={colors.red} />, onPress: () => setPhotoMenu(current => current ? { ...current, confirmDelete: true } : null) },
      ]
    : [
        { key: 'camera', label: 'Kamera ile çek', icon: <Camera size={18} color={colors.ink} />, onPress: () => { setPhotoMenu(null); void addPhoto('camera'); } },
        { key: 'library', label: 'Galeriden seç', icon: <ImagePlus size={18} color={colors.ink} />, onPress: () => { setPhotoMenu(null); void addPhoto('library'); } },
      ];

  return (
    <Screen scroll style={styles.screen}>
      <View style={styles.snapTopBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/notifications')}
          style={styles.headerIconButton}
        >
          <Bell size={20} color={colors.ink} />
          {unreadCount > 0 && <View style={styles.bellBadge} />}
        </Pressable>

        <Text style={styles.topBarTitle}>Profil</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={styles.headerIconButton}
        >
          <Settings size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.snapHero}>
        <View>
          <Pressable accessibilityRole="button" accessibilityLabel="Profil fotoğrafı seçenekleri" onPress={choosePhoto} style={styles.avatarTouchTarget}>
            <View style={[styles.snapNormalRing, isVip && styles.snapVipRing]}>
              <Avatar name={p?.displayName || 'Sen'} size={92} mediaAssetId={primaryPhoto?.mediaAssetId} />
              <View pointerEvents="none" style={styles.snapAddBadge}>
                <Plus size={16} color={colors.onAccent} strokeWidth={3} />
              </View>
            </View>
          </Pressable>
        </View>

        <View style={styles.snapNameRow}>
          <Text style={styles.snapDisplayName}>{p?.displayName || 'MindMatch Üyesi'}</Text>
          {isVip && (
            <View

              style={styles.snapVipBadge}
            >
              <Crown size={12} color={colors.ink} fill={colors.ink} />
              <Text style={styles.snapVipBadgeText}>VIP</Text>
            </View>
          )}
        </View>

        <Text style={styles.snapHandleText}>
          {p?.age ? `${p.age} yaş` : ''}
          {p?.city ? ` · ${p.city}` : ''}
        </Text>

        {p?.bio?.trim() ? (
          <Text numberOfLines={2} style={styles.snapBioText}>{p.bio.trim()}</Text>
        ) : (
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={styles.snapBioPlaceholder}>+ Bio ekle</Text>
          </Pressable>
        )}

        <Pressable accessibilityRole="button" accessibilityLabel="Ruh hâlini düzenle" onPress={() => router.push('/mood')} style={styles.moodShortcut}>
          <MoodMascot mood={mood.data && !mood.data.isExpired ? mood.data.mood : 9} size={42} />
          <Text style={styles.moodShortcutText}>{mood.data && !mood.data.isExpired ? moodOption(mood.data.mood).label : 'Ruh hâlini seç'}</Text>
          <ChevronRight size={16} color={colors.violetDark} />
        </Pressable>

        <View style={styles.snapActionPillsRow}>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.snapPillSecondary}
          >
            <Pencil size={15} color={colors.ink} />
            <Text style={styles.snapPillSecondaryText}>Düzenle</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/premium')}
            style={[styles.snapPillSecondary, isVip && styles.snapPillVip]}
          >
            <Crown size={15} color={isVip ? colors.ink : colors.violet} />
            <Text style={[styles.snapPillSecondaryText, isVip && { color: colors.ink }]}>
              {isVip ? 'Üyelik' : 'VIP'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.sectionTitle}>Fotoğraflar</Text>
            <Text style={styles.photoCountText}>{photoList.length}/6</Text>
          </View>
          {uploadingPhoto ? (
            <ActivityIndicator size="small" color={colors.violetDark} />
          ) : (
            <Pressable onPress={choosePhoto}>
            <Text style={styles.sectionActionText}>+ Ekle</Text>
            </Pressable>
          )}
        </View>

        {uploadingPhoto && <Text style={styles.uploadingNotice}>{photoUploadStage}</Text>}
        {photoUploadError ? <Text style={styles.uploadErrorNotice}>{photoUploadError}</Text> : null}

        <View style={styles.photoGrid}>
          {photoList.map(photo => (
            <Pressable
              key={photo.id}
              onPress={event => photoActions(photo, event)}
              style={styles.photoGridSlot}
            >
              {photo.mediaAssetId ? (
                <ProtectedImage mediaAssetId={photo.mediaAssetId} style={StyleSheet.absoluteFill} />
              ) : null}

              {photo.isPrimary ? (
                <View style={styles.primaryStarBadge}>
                  <Star size={10} color={colors.ink} fill={colors.ink} />
                  <Text style={styles.primaryStarText}>ANA</Text>
                </View>
              ) : null}
            </Pressable>
          ))}

          {photoList.length < 6 ? (
            <Pressable onPress={choosePhoto} style={styles.emptyPhotoSlot}>
              <ImagePlus size={22} color={colors.muted} />
              <Text style={styles.emptySlotText}>Ekle</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {selectedInterestNames.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>İlgi Alanlarım</Text>
          <View style={styles.interestChipsRow}>
            {selectedInterestNames.map((name, i) => (
              <View key={i} style={styles.interestChip}>
                <Text style={styles.interestChipText}>#{name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Gizlilik</Text>

        <View style={styles.groupedCell}>
          <View style={styles.groupedCellLeft}>
            <Globe size={18} color={colors.violetDark} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.cellTitle}>Keşfette görünür</Text>
            </View>
          </View>
          <Switch
            value={p?.isProfileVisible}
            onValueChange={val => visible.mutate(val)}
            trackColor={{ false: '#DDD', true: colors.violet }}
            thumbColor="#FFF"
          />
        </View>

        <Pressable onPress={() => router.push('/settings')} style={styles.groupedNavCell}>
          <View style={styles.groupedCellLeft}>
            <Shield size={18} color={colors.ink} />
          <Text style={[styles.cellTitle, { marginLeft: 12 }]}>Güvenlik ayarları</Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>

        <Pressable
          onPress={() =>
            Alert.alert('Çıkış Yap', 'Oturumunu kapatmak istediğine emin misin?', [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Çıkış Yap', style: 'destructive', onPress: () => signOut() },
            ])
          }
          style={[styles.groupedNavCell, { borderBottomWidth: 0 }]}
        >
          <View style={styles.groupedCellLeft}>
            <LogOut size={18} color={colors.red} />
            <Text style={[styles.cellTitle, { marginLeft: 12, color: colors.red }]}>Oturumu Kapat</Text>
          </View>
        </Pressable>
      </View>

      <ContextMenu
        visible={Boolean(photoMenu)}
        anchor={photoMenu?.anchor ?? null}
        actions={photoMenuActions}
        title={photoMenu?.confirmDelete ? 'Fotoğraf silinsin mi?' : undefined}
        detail={photoMenu?.confirmDelete ? 'Bu işlem geri alınamaz.' : undefined}
        onClose={() => setPhotoMenu(null)}
      />
    </Screen>
  );
}

const useStyles = createThemedStyles(colors => ({
  moodShortcut: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 46, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.paleViolet, marginTop: 13 },
  moodShortcutText: { color: colors.violetDark, fontSize: 12, fontWeight: '600' },
  screen: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  snapTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  snapHero: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  avatarTouchTarget: {
    position: 'relative',
    marginBottom: 8,
  },
  snapNormalRing: {
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapVipRing: {
    borderColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 1,
  },
  snapAddBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  snapNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  snapDisplayName: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: colors.ink,
  },
  snapVipBadge: {
    backgroundColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  snapVipBadgeText: { color: colors.ink, fontSize: 10, fontWeight: '700' },
  snapHandleText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 8,
  },
  snapBioText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 10,
  },
  snapBioPlaceholder: {
    fontSize: 13,
    color: colors.violetDark,
    fontWeight: '700',
    marginBottom: 10,
  },
  snapActionPillsRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 2,
  },
  snapPillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  snapPillSecondaryText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  snapPillVip: {
    backgroundColor: colors.surface,
    borderColor: colors.amber,
  },
  sectionCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sectionActionText: { fontSize: 12, fontWeight: '600', color: colors.violet },
  photoCountText: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  uploadingNotice: { fontSize: 11, color: colors.violetDark, fontWeight: '700', marginBottom: 8 },
  uploadErrorNotice: { fontSize: 11, color: colors.red, marginBottom: 8 },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoGridSlot: {
    width: '31%', flexGrow: 1, maxWidth: '33%',
    aspectRatio: 0.85,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.paleViolet,
    borderWidth: 0,
  },
  emptyPhotoSlot: {
    width: '31%', flexGrow: 1, maxWidth: '33%',
    aspectRatio: 0.85,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptySlotText: { fontSize: 11, fontWeight: '600', color: colors.muted },
  primaryStarBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(21, 23, 18, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  primaryStarText: { color: colors.ink, fontSize: 8, fontWeight: '700' },
  interestChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestChip: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  interestChipText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  groupedCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  groupedNavCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  groupedCellLeft: { flexDirection: 'row', alignItems: 'center' },
  cellTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  cellSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
}));
