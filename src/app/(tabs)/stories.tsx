import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image as NativeImage,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CirclePlus, ImagePlus, Play, RefreshCw, Sparkles, Users, X } from '../../components/icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';

import { mediaApi, profileApi, storyApi } from '../../api/mindmatch';
import { Avatar, Button, Empty, Loading, ProtectedImage, Screen } from '../../components/ui';
import { useTheme, createThemedStyles } from '../../theme/tokens';
import { normalizeImageForUpload, uploadFailureMessage } from '../../utils/media';
import type { Story } from '../../api/types';


export default function StoriesScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [caption, setCaption] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draft, setDraft] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  useEffect(() => {
    if (compose === '1') { setPickerVisible(true); router.setParams({ compose: undefined }); }
  }, [compose]);

  // Feed: all public stories from all visible profiles
  const feed = useQuery({ queryKey: ['stories'], queryFn: storyApi.feed, refetchInterval: 60_000 });
  const mine = useQuery({ queryKey: ['my-stories'], queryFn: storyApi.mine });
  const myProfile = useQuery({ queryKey: ['my-profile'], queryFn: profileApi.mine });
  const myPhotos = useQuery({ queryKey: ['my-photos'], queryFn: () => profileApi.photos() });
  const myPrimaryPhoto = myPhotos.data?.find(photo => photo.isPrimary) ?? myPhotos.data?.[0];

  // Group stories by userId (like Instagram)
  const storiesByUser = useMemo(() => {
    const map = new Map<string, Story[]>();
    for (const story of feed.data ?? []) {
      const list = map.get(story.userId) || [];
      list.push(story);
      map.set(story.userId, list);
    }
    // Sort each user's stories chronologically
    for (const [uid, list] of map.entries()) {
      list.sort((a, b) => new Date(a.createdAtUtc).getTime() - new Date(b.createdAtUtc).getTime());
    }
    return map;
  }, [feed.data]);

  const ownerIds = Array.from(storiesByUser.keys());
  const people = useQueries({
    queries: ownerIds.map(userId => ({
      queryKey: ['profile', userId],
      queryFn: () => profileApi.get(userId),
    })),
  });
  const peopleById = useMemo(() => {
    return new Map(ownerIds.map((userId, index) => [userId, people[index]?.data]));
  }, [ownerIds, people]);

  async function addStory(source: 'camera' | 'library' = 'library') {
    if (uploading) return;
    setPickerVisible(false);
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error(source === 'camera' ? 'Kamera izni gerekli.' : 'Galeri izni gerekli.');
      const options = { mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[], quality: .85, videoMaxDuration: 30, videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) { setDraft(result.assets[0]); setUploadError(''); }
    } catch (error) { Alert.alert('Medya seçilemedi', uploadFailureMessage(error)); }
  }
  async function publishStory() {
    if (!draft || uploading) return;
    setUploading(true);
    setUploadStage('Hazırlanıyor…');
    setUploadError('');
    try {
      const isVideo = draft.type === 'video';
      const normalized = isVideo ? { uri: draft.uri, fileName: draft.fileName || 'mindmatch-story.mp4', mimeType: draft.mimeType || 'video/mp4' } : await normalizeImageForUpload(draft.uri);
      setUploadStage('Paylaşılıyor…');
      const media = await mediaApi.upload(normalized.uri, normalized.fileName, normalized.mimeType, isVideo ? 5 : 4);
      try { await storyApi.create(media.id, isVideo ? 2 : 1, caption.trim() || undefined); }
      catch (error) { await mediaApi.delete(media.id).catch(() => {}); throw error; }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDraft(null);
      setCaption('');
      await Promise.all([qc.invalidateQueries({ queryKey: ['stories'] }), qc.invalidateQueries({ queryKey: ['my-stories'] })]);
    } catch (error) { setUploadError(uploadFailureMessage(error)); }
    finally { setUploading(false); setUploadStage(''); }
  }
  function chooseStory() { setPickerVisible(true); }

  function openUserStory(userId: string, targetStoryId?: string) {
    const list = storiesByUser.get(userId) || [];
    const firstId = targetStoryId || list[0]?.id;
    if (!firstId) return;
    router.push({ pathname: '/story/[id]', params: { id: firstId, userId } });
  }

  function openMyStory() {
    if (!mine.data?.length) {
      chooseStory();
      return;
    }
    router.push({ pathname: '/story/[id]', params: { id: mine.data[0].id, userId: myProfile.data?.userId } });
  }

  function formatTimeAgo(dateStr: string) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dk önce`;
    if (diffHours < 24) return `${diffHours} sa önce`;
    return 'Dün';
  }

  if (feed.isLoading) {
    return (
      <Screen>
        <Loading label="Hikâyeler yükleniyor…" />
      </Screen>
    );
  }

  return (
    <Screen scroll style={styles.screen}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.pageTitle}>Hikâyeler</Text>
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            feed.refetch();
          }}
        >
          <RefreshCw size={17} color={colors.violetDark} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Instagram-Style Story Tray (Horizontal Scroll) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storyTray}
      >
        {/* My Story Avatar */}
        <Pressable style={styles.storyCircleWrap} onPress={openMyStory}>
          <View style={[styles.avatarBorder, mine.data?.length ? styles.hasStoriesBorder : styles.noStoriesBorder]}>
            <Avatar
              name={myProfile.data?.displayName || 'Sen'}
              mediaAssetId={myPrimaryPhoto?.mediaAssetId}
              size={60}
            />
            <View style={styles.myStoryPlus}>
              <CirclePlus size={18} color={colors.onAccent} fill={colors.violet} />
            </View>
          </View>
          <Text style={styles.storyCircleName} numberOfLines={1}>
            {mine.data?.length ? 'Hikâyen' : 'Ekle'}
          </Text>
        </Pressable>

        {/* Other Users' Story Circles */}
        {ownerIds.map(userId => {
          const list = storiesByUser.get(userId) || [];
          const profile = peopleById.get(userId);
          const hasUnviewed = list.some(s => !s.hasViewed);

          return (
            <Pressable
              key={userId}
              style={styles.storyCircleWrap}
              onPress={() => openUserStory(userId)}
            >
              {hasUnviewed ? (
                <View



                  style={styles.storyRing}
                >
                  <View style={styles.innerRing}>
                    <Avatar name={profile?.displayName || 'Üye'} size={56} />
                  </View>
                </View>
              ) : (
                <View style={[styles.avatarBorder, styles.viewedBorder]}>
                  <Avatar name={profile?.displayName || 'Üye'} size={56} />
                </View>
              )}

              <Text style={styles.storyCircleName} numberOfLines={1}>
                {profile?.displayName || 'Kullanıcı'}
              </Text>
              {list.length > 1 && (
                <View style={styles.storyCountBadge}>
                  <Text style={styles.storyCountText}>{list.length}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.shareCard}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Bir not bırak…"
          placeholderTextColor={colors.faint}
          maxLength={150}
          style={styles.captionInput}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Hikâye ekle" disabled={uploading} onPress={chooseStory} style={styles.shareAction}>
          {uploading ? <ActivityIndicator color={colors.onAccent} /> : <Camera size={21} color={colors.onAccent} />}
        </Pressable>
      </View>

      {uploading && <Text style={styles.uploadStageText}>{uploadStage}</Text>}
      {uploadError ? <Text style={styles.uploadErrorText}>{uploadError}</Text> : null}

      {/* Feed Section Title */}
      <View style={styles.feedHeaderRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} color={colors.violetDark} />
          <Text style={styles.feedSectionTitle}>Anlar</Text>
        </View>
        <Text style={styles.feedCountLabel}>{feed.data?.length || 0} hikâye</Text>
      </View>

      {/* Story Cards List: Grouped by User */}
      {ownerIds.length > 0 ? (
        <View style={styles.storyCardsList}>
          {ownerIds.map(userId => {
            const list = storiesByUser.get(userId) || [];
            const profile = peopleById.get(userId);
            const latestStory = list[list.length - 1];
            const hasUnviewed = list.some(s => !s.hasViewed);

            return (
              <Pressable
                key={userId}
                onPress={() => openUserStory(userId)}
                style={({ pressed }) => [styles.userStoryCard, pressed && { opacity: 0.9 }]}
              >
                {/* User Header */}
                <View style={styles.cardUserHeader}>
                  <Avatar name={profile?.displayName || 'Üye'} size={42} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.cardUserName}>{profile?.displayName || 'Kullanıcı'}</Text>
                      {hasUnviewed && <View style={styles.newBadge} />}
                    </View>
                    <Text style={styles.cardTimeText}>
                      {formatTimeAgo(latestStory.createdAtUtc)}
                    </Text>
                  </View>
                  <Text style={styles.watchPrompt}>↗</Text>
                </View>

                {/* Preview Thumbnail */}
                <View style={styles.cardThumbnailWrap}>
                  {latestStory.mediaAssetId ? (
                    <ProtectedImage mediaAssetId={latestStory.mediaAssetId} style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={styles.thumbFallback}>
                      <Sparkles size={28} color="#FFF" />
                    </View>
                  )}
                  <View

                    style={[StyleSheet.absoluteFill, { backgroundColor: '#00000038' }]}
                  />

                  {latestStory.mediaType === 2 && (
                    <View style={styles.playBadge}>
                      <Play size={16} color="#FFFFFF" fill="#FFFFFF" />
                    </View>
                  )}

                  {latestStory.caption ? (
                    <Text style={styles.cardCaption} numberOfLines={2}>
                      "{latestStory.caption}"
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Empty
            icon={<Sparkles size={24} color={colors.violetDark} />}
            title="Henüz aktif hikâye yok"
            detail="İlk anı sen paylaş."
            action={
              <Button
                title="Hikâye Paylaş"
                onPress={chooseStory}
                style={{ marginTop: 14 }}
              />
            }
          />
        </View>
      )}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Kapat" onPress={() => setPickerVisible(false)} />
          <SafeAreaView edges={['bottom']} style={styles.pickerSheet}>
            <View style={styles.pickerHeading}><Text style={styles.feedSectionTitle}>An ekle</Text><Pressable accessibilityLabel="Kapat" style={styles.pickerClose} onPress={() => setPickerVisible(false)}><X size={22} color={colors.ink} /></Pressable></View>
            <View style={styles.pickerOptions}><Pressable accessibilityRole="button" onPress={() => { void addStory('camera'); }} style={styles.pickerOption}><Camera size={28} color={colors.violetDark} /><Text style={styles.pickerLabel}>Kamera</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { void addStory('library'); }} style={styles.pickerOption}><ImagePlus size={28} color={colors.violetDark} /><Text style={styles.pickerLabel}>Galeri</Text></Pressable></View>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal visible={Boolean(draft)} animationType="slide" onRequestClose={() => { if (!uploading) setDraft(null); }}>
        <SafeAreaView style={styles.draftPage}>
          <View style={styles.pickerHeading}><Pressable accessibilityLabel="Vazgeç" disabled={uploading} style={styles.pickerClose} onPress={() => setDraft(null)}><X size={22} color={colors.ink} /></Pressable><Text style={styles.feedSectionTitle}>Hikâyen</Text><View style={{ width: 44 }} /></View>
          <View style={styles.draftMedia}>{draft?.type === 'video' ? <DraftVideo uri={draft.uri} /> : draft ? <NativeImage source={{ uri: draft.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} /> : null}</View>
          <TextInput accessibilityLabel="Hikâye notu" value={caption} onChangeText={setCaption} maxLength={500} placeholder="Bir not ekle…" placeholderTextColor={colors.faint} style={styles.draftCaption} />
          {uploadError ? <Text style={styles.uploadErrorText}>{uploadError}</Text> : null}
          {uploading ? <Text style={styles.uploadStageText}>{uploadStage}</Text> : null}
          <Button title="Paylaş" loading={uploading} onPress={() => { void publishStory(); }} />
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

function DraftVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, video => { video.loop = true; });
  return <VideoView player={player} nativeControls style={StyleSheet.absoluteFill} contentFit="contain" />;
}

const useStyles = createThemedStyles(colors => ({
  pickerBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }, pickerSheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 },
  pickerHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, pickerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  pickerOptions: { flexDirection: 'row', gap: 12, paddingBottom: 16 }, pickerOption: { flex: 1, minHeight: 112, backgroundColor: colors.surface, borderRadius: 24, justifyContent: 'center', alignItems: 'center', gap: 12 }, pickerLabel: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  draftPage: { flex: 1, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: colors.canvas }, draftMedia: { flex: 1, overflow: 'hidden', borderRadius: 24, backgroundColor: colors.surface }, draftCaption: { marginVertical: 16, minHeight: 52, paddingHorizontal: 16, color: colors.ink, borderRadius: 26, backgroundColor: colors.surface },
  screen: { paddingHorizontal: 20, paddingTop: 14 },
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', color: colors.violet },
  pageTitle: { fontSize: 31, fontWeight: '600', letterSpacing: -0.8, color: colors.ink, marginTop: 2 },
  refreshBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  storyTray: { flexDirection: 'row', gap: 17, paddingVertical: 10, marginBottom: 20 },
  storyCircleWrap: { alignItems: 'center', width: 68 },
  avatarBorder: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  hasStoriesBorder: { borderColor: colors.violet },
  noStoriesBorder: { borderColor: colors.line },
  viewedBorder: { borderColor: '#DDD' },
  storyRing: { backgroundColor: colors.lilac, width: 68, height: 68, borderRadius: 34, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  innerRing: { width: 63, height: 63, borderRadius: 31.5, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  myStoryPlus: { position: 'absolute', bottom: -2, right: -2 },
  storyCircleName: { fontSize: 11, fontWeight: '700', color: colors.ink, marginTop: 6, textAlign: 'center', width: 66 },
  storyCountBadge: { position: 'absolute', top: 0, right: 4, backgroundColor: colors.coral, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  storyCountText: { color: colors.onAccent, fontSize: 9, fontWeight: '700' },
  shareCard: { minHeight: 60, paddingLeft: 18, paddingRight: 6, borderRadius: 30, marginBottom: 23, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareAction: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  shareHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  shareTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  shareSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  captionInput: { flex: 1, minHeight: 48, fontSize: 14, color: colors.ink },
  uploadStageText: { fontSize: 11, color: colors.violetDark, fontWeight: '700', marginTop: 8 },
  uploadErrorText: { fontSize: 11, color: colors.red, marginTop: 8 },
  shareButtonsRow: { marginTop: 12 },
  feedHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  feedSectionTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  feedCountLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  storyCardsList: { gap: 16 },
  userStoryCard: { borderRadius: 26, overflow: 'hidden' },
  cardUserHeader: { position: 'absolute', zIndex: 2, top: 14, left: 14, right: 14, flexDirection: 'row', alignItems: 'center' },
  cardUserName: { fontSize: 15, fontWeight: '600', color: colors.white },
  newBadge: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral },
  newBadgeText: { color: colors.coral, fontSize: 9, fontWeight: '700' },
  cardTimeText: { fontSize: 11, color: '#FFFFFFD6', marginTop: 2 },
  watchPrompt: { fontSize: 24, color: colors.white, fontWeight: '600' },
  cardThumbnailWrap: { height: 230, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.night, justifyContent: 'flex-end', padding: 15 },
  thumbFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleViolet },
  playBadge: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  cardCaption: { color: colors.white, fontSize: 14, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
  emptyCard: { padding: 24, borderRadius: 20 },
}));
