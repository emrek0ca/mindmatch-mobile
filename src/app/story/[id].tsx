import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Eye, Trash2, X } from '../../components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { API_URL, sessionTokens } from '../../api/client';
import { profileApi, storyApi } from '../../api/mindmatch';
import { Avatar, Loading, ProtectedImage } from '../../components/ui';
import { useSession } from '../../state/session';
import { useTheme, createThemedStyles } from '../../theme/tokens';
import type { Story } from '../../api/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION_MS = 5000; // 5 seconds per story like Instagram

export default function StoryScreen() {
  const { colors } = useTheme();
  const s = usePageStyles();

  const params = useLocalSearchParams<{ id: string; userId?: string }>();
  const storyId = params.id;
  const initialUserId = params.userId;

  const insets = useSafeAreaInsets();
  const user = useSession(state => state.user);
  const queryClient = useQueryClient();

  const [token, setToken] = useState<string | null>(null);
  const [videoFailure, setVideoFailure] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [isPaused, setIsPaused] = useState(false);
  const [showViewersModal, setShowViewersModal] = useState(false);

  // Fetch target story to discover owner if userId not provided
  const targetStory = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => storyApi.get(storyId),
    enabled: Boolean(storyId),
  });

  const ownerUserId = initialUserId || targetStory.data?.userId;
  const ownStory = Boolean(ownerUserId && user?.userId && ownerUserId === user.userId);

  // Fetch all stories for this user so we can play them sequentially (Instagram style)
  const userStoriesQuery = useQuery({
    queryKey: ['user-stories', ownerUserId],
    queryFn: async () => {
      if (!ownerUserId) return [];
      if (ownStory) return storyApi.mine();
      return storyApi.byUser(ownerUserId);
    },
    enabled: Boolean(ownerUserId),
  });

  // Fallback to feed if byUser returns empty or errors
  const storiesList: Story[] = (userStoriesQuery.data && userStoriesQuery.data.length > 0)
    ? [...userStoriesQuery.data].sort((a, b) => new Date(a.createdAtUtc).getTime() - new Date(b.createdAtUtc).getTime())
    : (targetStory.data ? [targetStory.data] : []);

  // Initialize index to the requested story
  useEffect(() => {
    if (storiesList.length > 0 && storyId) {
      const idx = storiesList.findIndex(s => s.id === storyId);
      if (idx >= 0) setCurrentIndex(idx);
    }
  }, [storiesList.length, storyId]);

  const currentStory: Story | undefined = storiesList[currentIndex] || targetStory.data;
  const currentStoryId = currentStory?.id;

  // Fetch owner profile
  const owner = useQuery({
    queryKey: ['profile', ownerUserId],
    queryFn: () => profileApi.get(ownerUserId!),
    enabled: Boolean(ownerUserId),
  });

  // Story viewers if own story
  const viewers = useQuery({
    queryKey: ['story-viewers', currentStoryId],
    queryFn: () => (currentStoryId ? storyApi.viewers(currentStoryId) : Promise.resolve([])),
    enabled: Boolean(currentStoryId && ownStory),
    refetchInterval: ownStory ? 10000 : false,
  });

  const viewerProfiles = useQueries({
    queries: (viewers.data ?? []).slice(0, 30).map(v => ({
      queryKey: ['profile', v.viewerId],
      queryFn: () => profileApi.get(v.viewerId),
    })),
  });

  const player = useVideoPlayer(null);
  const videoReady = useRef(false);
  const paused = useRef(isPaused);

  const removeStory = useMutation({
    mutationFn: () => storyApi.delete(currentStoryId!),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stories'] }),
        queryClient.invalidateQueries({ queryKey: ['my-stories'] }),
        queryClient.invalidateQueries({ queryKey: ['user-stories', ownerUserId] }),
      ]);
      if (storiesList.length <= 1) {
        closeStory();
      } else {
        setCurrentIndex(prev => Math.max(0, prev - 1));
      }
    },
    onError: error => Alert.alert('Hikâye silinemedi', error.message),
  });

  function closeStory() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/chats');
  }

  // Load auth token
  useEffect(() => {
    sessionTokens.access().then(setToken);
  }, []);

  // Mark story as viewed
  useEffect(() => {
    if (!currentStoryId || ownStory) return;
    storyApi.view(currentStoryId).catch(() => {});
  }, [currentStoryId, ownStory]);

  // Handle Video media playback
  useEffect(() => {
    videoReady.current = false;
    const mediaId = currentStory?.mediaAssetId;
    if (currentStory?.mediaType !== 2 || !mediaId || !token) {
      try { player.pause(); } catch { /* The hook may already have released the player. */ }
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setVideoFailure(null);

    if (Platform.OS === 'web') {
      const controller = new AbortController();
      fetch(`${API_URL}/api/media/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then(async res => {
          if (!res.ok) throw new Error(`Video alınamadı (${res.status})`);
          return res.blob();
        })
        .then(async blob => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          player.muted = true;
          await player.replaceAsync(objectUrl);
          if (!cancelled) {
            videoReady.current = true;
            if (!paused.current) player.play();
          }
        })
        .catch(err => {
          if (!cancelled) setVideoFailure(err instanceof Error ? err.message : 'Video oynatılamadı.');
        });

      return () => {
        cancelled = true;
        controller.abort();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    player
      .replaceAsync({
        uri: `${API_URL}/api/media/${mediaId}`,
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(() => {
        if (!cancelled) {
          videoReady.current = true;
          if (!paused.current) player.play();
        }
      })
      .catch(err => { if (!cancelled) setVideoFailure(err instanceof Error ? err.message : 'Video oynatılamadı.'); });

    return () => {
      cancelled = true;
    };
  }, [currentStoryId, currentStory?.mediaAssetId, currentStory?.mediaType, token, player]);

  useEffect(() => {
    paused.current = isPaused;
    if (!videoReady.current) return;
    try {
      if (isPaused) player.pause();
      else player.play();
    } catch { /* A route transition can release the native player first. */ }
  }, [isPaused, player]);

  // 5-second Instagram timer & auto progression
  useEffect(() => {
    if (isPaused || storiesList.length === 0) return;

    setProgress(0);
    const intervalMs = 50;
    const step = intervalMs / STORY_DURATION_MS;

    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + step;
        if (next >= 1) {
          clearInterval(interval);
          // Advance to next story
          goToNextStory();
          return 1;
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [currentIndex, storiesList.length, isPaused]);

  function goToNextStory() {
    if (currentIndex < storiesList.length - 1) {
      Haptics.selectionAsync().catch(() => {});
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      // Last story reached -> close viewer!
      closeStory();
    }
  }

  function goToPreviousStory() {
    if (currentIndex > 0) {
      Haptics.selectionAsync().catch(() => {});
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    } else {
      // Restart first story
      setProgress(0);
    }
  }

  // Format relative time like Instagram ("15 dk önce", "2 sa önce", "Dün")
  function formatRelativeTime(dateString?: string) {
    if (!dateString) return '';
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dk önce`;
    if (diffHours < 24) return `${diffHours} sa önce`;
    if (diffDays === 1) return 'Dün';
    return `${diffDays} gün önce`;
  }

  if (targetStory.isLoading || userStoriesQuery.isLoading) {
    return (
      <View style={s.loading}>
        <Loading label="Hikâyeler hazırlanıyor…" />
      </View>
    );
  }

  if (!currentStory) {
    return (
      <View style={s.root}>
        <Text style={{ color: colors.white, alignSelf: 'center' }}>Hikâye bulunamadı veya süresi doldu.</Text>
        <Pressable onPress={closeStory} style={{ marginTop: 20, alignSelf: 'center' }}>
          <Text style={{ color: colors.violetDark, fontWeight: '600' }}>Geri Dön</Text>
        </Pressable>
      </View>
    );
  }

  const isVideo = currentStory.mediaType === 2;

  return (
    <View style={s.root}>
      {/* Background Media */}
      {isVideo && currentStory.mediaAssetId ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      ) : currentStory.mediaAssetId ? (
        <ProtectedImage mediaAssetId={currentStory.mediaAssetId} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : (
        <View style={s.blank} />
      )}

      {/* Scrim overlay for top & bottom contrast */}
      <View style={s.scrimTop} pointerEvents="none" />
      <View style={s.scrimBottom} pointerEvents="none" />

      {/* Video Error Message if any */}
      {videoFailure ? (
        <View style={s.videoError}>
          <Text style={s.videoErrorTitle}>Video Oynatılamadı</Text>
          <Text style={s.videoErrorText}>{videoFailure}</Text>
        </View>
      ) : null}

      {/* Touch Targets: Left 30% = Prev, Right 70% = Next, Long Press = Pause */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable
          style={s.leftTouchArea}
          onPress={goToPreviousStory}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
        />
        <Pressable
          style={s.rightTouchArea}
          onPress={goToNextStory}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
        />
      </View>

      {/* Top Segmented Progress Bars (Instagram Style) */}
      <View style={[s.progressContainer, { top: insets.top + 8 }]} pointerEvents="none">
        {storiesList.map((st, idx) => {
          let fillPercent = 0;
          if (idx < currentIndex) fillPercent = 1;
          else if (idx === currentIndex) fillPercent = progress;

          return (
            <View key={st.id || idx} style={s.segmentTrack}>
              <View style={[s.segmentFill, { width: `${Math.min(100, Math.max(0, fillPercent * 100))}%` }]} />
            </View>
          );
        })}
      </View>

      {/* Top Header Bar: User Info, Time, Close & Action Buttons */}
      <View style={[s.topBar, { top: insets.top + 20 }]} pointerEvents="box-none">
        <View style={s.userInfoWrap}>
          <Avatar name={owner.data?.displayName || 'MindMatch'} size={38} />
          <View style={s.userMeta}>
            <Text style={s.userName} numberOfLines={1}>
              {owner.data?.displayName || 'Kullanıcı'}
            </Text>
            <Text style={s.storyTime}>
              {formatRelativeTime(currentStory.createdAtUtc)}
              {storiesList.length > 1 ? ` · ${currentIndex + 1}/${storiesList.length}` : ''}
            </Text>
          </View>
        </View>

        <View style={s.topActions}>
          {ownStory && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hikâyeyi Sil"
              onPress={() =>
                Alert.alert('Hikâyeyi Sil', 'Bu hikâye kalıcı olarak silinecek. Emin misin?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Sil', style: 'destructive', onPress: () => removeStory.mutate() },
                ])
              }
              style={s.iconButton}
            >
              <Trash2 size={18} color={colors.white} />
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={closeStory}
            style={s.iconButton}
          >
            <X size={22} color={colors.white} />
          </Pressable>
        </View>
      </View>

      {/* Caption at bottom if provided */}
      {currentStory.caption ? (
        <View style={[s.captionWrap, { bottom: ownStory ? insets.bottom + 84 : insets.bottom + 30 }]}>
          <Text style={s.captionText}>{currentStory.caption}</Text>
        </View>
      ) : null}

      {/* Own Story: Bottom Viewers Sheet Button */}
      {ownStory && (
        <Pressable
          style={[s.viewerBar, { bottom: insets.bottom + 14 }]}
          onPress={() => setShowViewersModal(true)}
        >
          <View style={s.viewerBarLeft}>
            <Eye size={17} color={colors.white} />
            <Text style={s.viewerBarText}>{viewers.data?.length ?? 0} kişi gördü</Text>
          </View>
          <Text style={s.viewerBarDetail}>Detaylar ↑</Text>
        </Pressable>
      )}

      {/* Viewers Bottom Sheet Modal */}
      <Modal visible={showViewersModal} transparent animationType="slide" onRequestClose={() => setShowViewersModal(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowViewersModal(false)} />
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={s.modalGrabber} />
            <View style={s.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Eye size={18} color={colors.violetDark} />
                <Text style={s.modalTitle}>Görüntüleyenler ({viewers.data?.length ?? 0})</Text>
              </View>
              <Pressable onPress={() => setShowViewersModal(false)}>
                <X size={20} color={colors.muted} />
              </Pressable>
            </View>

            {viewers.data?.length ? (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {viewers.data.map((v, i) => {
                  const prof = viewerProfiles[i]?.data;
                  return (
                    <View key={v.viewerId} style={s.viewerItem}>
                      <Avatar name={prof?.displayName || 'Üye'} size={40} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={s.viewerItemName}>{prof?.displayName || 'MindMatch Üyesi'}</Text>
                        <Text style={s.viewerItemTime}>{new Date(v.viewedAtUtc).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={s.modalEmpty}>Henüz kimse bu hikâyeyi görüntülemedi.</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const usePageStyles = createThemedStyles(colors => ({
  root: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  loading: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center' },
  blank: { ...StyleSheet.absoluteFillObject, backgroundColor: '#151712' },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  leftTouchArea: {
    position: 'absolute',
    left: 0,
    top: 90,
    bottom: 100,
    width: SCREEN_WIDTH * 0.35,
  },
  rightTouchArea: {
    position: 'absolute',
    right: 0,
    top: 90,
    bottom: 100,
    width: SCREEN_WIDTH * 0.65,
  },
  progressContainer: {
    position: 'absolute',
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  segmentTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  topBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  userInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  userMeta: { flex: 1 },
  userName: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  storyTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    fontWeight: '600',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    zIndex: 10,
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 21,
  },
  viewerBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(21,23,18,0.85)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 10,
  },
  viewerBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewerBarText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  viewerBarDetail: { color: colors.violetDark, fontSize: 12, fontWeight: '600' },
  videoError: {
    position: 'absolute',
    alignSelf: 'center',
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    zIndex: 5,
  },
  videoErrorTitle: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  videoErrorText: { color: '#AAA', fontSize: 11, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
  },
  modalGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  viewerItemName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  viewerItemTime: { fontSize: 11, color: colors.muted, marginTop: 2 },
  modalEmpty: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 30,
  },
}));
