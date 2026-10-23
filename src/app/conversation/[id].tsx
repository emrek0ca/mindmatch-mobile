import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, CheckCheck, Eye, EyeOff, Flag, ImagePlus, MessageCircle, Mic, MoreHorizontal, Pause, Phone, Play, Send, Shield, Sparkles, Square, Trash2, Video, X, RefreshCw } from '../../components/icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blockApi, chatApi, callApi, matchApi, mediaApi, presenceApi, profileApi } from '../../api/mindmatch';
import { Avatar, Button, Card, Empty, Loading, ProtectedImage } from '../../components/ui';
import { SoftSurface } from '../../components/SoftSurface';
import { ContextMenu, type ContextMenuAction, type MenuAnchor } from '../../components/ContextMenu';
import { useTheme, createThemedStyles } from '../../theme/tokens';
import { useSession } from '../../state/session';
import { connectMessages, getMessageHub, onMessagesReconnected } from '../../realtime/hub';
import { normalizeImageForUpload, uploadFailureMessage } from '../../utils/media';
import { API_URL, freshAccessToken, sessionTokens } from '../../api/client';
import type { Message } from '../../api/types';

let activeVoicePlayer: { pause: () => void } | null = null;

export default function ConversationScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const { id, userId: routeUserId, name } = useLocalSearchParams<{ id: string; userId?: string; name?: string }>();
  const me = useSession(x => x.user);
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [isOtherTyping, setOtherTyping] = useState(false);
  const typingSentAt = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadStage, setImageUploadStage] = useState('');
  const [imageUploadError, setImageUploadError] = useState('');
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [callHistoryVisible, setCallHistoryVisible] = useState(false);
  const [hiddenPhotoSending, setHiddenPhotoSending] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ kind: 'attachment' | 'chat' | 'message' | 'confirm-hide' | 'confirm-end' | 'confirm-block' | 'confirm-delete-all'; anchor: MenuAnchor } | null>(null);
  const [lightboxMediaId, setLightboxMediaId] = useState<string | null>(null);
  const [revealedPhotos, setRevealedPhotos] = useState<Set<string>>(new Set());

  const conversationList = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations, enabled: !routeUserId, staleTime: 60_000 });
  const userId = routeUserId || conversationList.data?.find(conversation => conversation.id === id)?.otherUserId;

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'cache',
    bitRate: 64000,
    numberOfChannels: 1,
  });
  const recorderState = useAudioRecorderState(audioRecorder, 1000);
  const recordingWasActive = useRef(false);
  const finalizingRecording = useRef(false);
  const listRef = useRef<FlatList<Message>>(null);
  const hasInitialScroll = useRef(false);
  const loadingOlder = useRef(false);
  const q = useInfiniteQuery({
    queryKey: ['messages', id],
    initialPageParam: undefined as { createdAtUtc: string; messageId: string } | undefined,
    queryFn: ({ pageParam }) => chatApi.messages(id, pageParam),
    getNextPageParam: last => last.hasMore && last.nextBeforeCreatedAtUtc && last.nextBeforeMessageId
      ? { createdAtUtc: last.nextBeforeCreatedAtUtc, messageId: last.nextBeforeMessageId }
      : undefined,
    refetchInterval: 60_000,
  });
  const matches = useQuery({ queryKey: ['matches'], queryFn: matchApi.list });
  const callHistory = useQuery({ queryKey: ['call-history', id], queryFn: () => callApi.history(id), enabled: callHistoryVisible, staleTime: 0 });
  const messages = useMemo(() => q.data?.pages.slice().reverse().flatMap(page => page.items) ?? [], [q.data?.pages]);
  const profile = useQuery({ queryKey: ['profile', userId], queryFn: () => chatApi.profile(userId!), enabled: Boolean(userId) });
  const profilePhotos = useQuery({ queryKey: ['profile-photos', userId], queryFn: () => profileApi.photos(userId!), enabled: Boolean(userId), staleTime: 300_000 });
  const primaryPhoto = profilePhotos.data?.find(photo => photo.isPrimary) ?? profilePhotos.data?.[0];
  const displayName = profile.data?.displayName?.trim() || name?.trim() || 'Sohbet';
  const presence = useQuery({ queryKey: ['presence', userId], queryFn: () => presenceApi.get(userId!), enabled: Boolean(userId), refetchInterval: 60_000 });
  const readAttempts = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const offReconnect = onMessagesReconnected(() => {
      setOtherTyping(false);
      qc.invalidateQueries({ queryKey: ['messages', id] });
      qc.invalidateQueries({ queryKey: ['presence', userId] });
    });
    connectMessages().then(hub => {
      if (!hub || !active) return;
      const refresh = (message: { conversationId?: string }) => {
        if (!message?.conversationId || message.conversationId === id) qc.invalidateQueries({ queryKey: ['messages', id] });
      };
      hub.on('MessageCreated', refresh);
      hub.on('MessageDeleted', refresh);
      hub.on('MessageHidden', refresh);
      hub.on('MessageStatusChanged', refresh);
      const typing = (event: { conversationId?: string; userId?: string; isTyping?: boolean }) => {
        if (event.conversationId !== id || event.userId === me?.userId) return;
        if (typingExpiryTimer.current) clearTimeout(typingExpiryTimer.current);
        setOtherTyping(Boolean(event.isTyping));
        if (event.isTyping) typingExpiryTimer.current = setTimeout(() => setOtherTyping(false), 4000);
      };
      hub.on('TypingChanged', typing);
      unsubscribe = () => {
        hub.off('MessageCreated', refresh);
        hub.off('MessageDeleted', refresh);
        hub.off('MessageHidden', refresh);
        hub.off('MessageStatusChanged', refresh);
        hub.off('TypingChanged', typing);
      };
    });
    return () => {
      active = false;
      unsubscribe?.();
      offReconnect();
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (typingExpiryTimer.current) clearTimeout(typingExpiryTimer.current);
      const hub = getMessageHub();
      if (hub?.state === 'Connected') void hub.invoke('SendTyping', id, false).catch(() => {});
    };
  }, [id, userId, me?.userId, qc]);

  function updateDraft(value: string) {
    setText(value);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    const hub = getMessageHub();
    if (hub?.state !== 'Connected') return;
    const now = Date.now();
    if (!value.trim() || now - typingSentAt.current > 2000) {
      typingSentAt.current = now;
      void hub.invoke('SendTyping', id, Boolean(value.trim())).catch(() => {});
    }
    if (value.trim()) typingStopTimer.current = setTimeout(() => {
      if (hub.state === 'Connected') void hub.invoke('SendTyping', id, false).catch(() => {});
      typingSentAt.current = 0;
    }, 2000);
  }

  useEffect(() => {
    if (loadingOlder.current) { loadingOlder.current = false; return; }
    if (messages.length && hasInitialScroll.current) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);
  useEffect(() => {
    if (!q.isFetchingNextPage && loadingOlder.current) loadingOlder.current = false;
  }, [q.isFetchingNextPage, q.data?.pages.length]);

  async function loadOlderMessages() {
    if (!q.hasNextPage || q.isFetchingNextPage) return;
    loadingOlder.current = true;
    try { await q.fetchNextPage(); }
    catch { loadingOlder.current = false; }
  }

  useEffect(() => { readAttempts.current.clear(); hasInitialScroll.current = false; }, [id]);
  useEffect(() => {
    if (!me?.userId || !focused || !appActive) return;
    const unread = messages.filter(message => message.senderId !== me.userId && message.status < 3 && !message.isDeletedForEveryone && !readAttempts.current.has(message.id));
    if (!unread.length) return;
    unread.forEach(message => readAttempts.current.add(message.id));
    let next = 0;
    let updated = 0;
    let cancelled = false;
    const worker = async () => {
      while (!cancelled && next < unread.length) {
        const message = unread[next++];
        try {
          await chatApi.markDelivered(message.id);
          if (cancelled) break;
          await chatApi.markRead(message.id);
          updated++;
        }
        catch { readAttempts.current.delete(message.id); }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, unread.length) }, worker)).then(() => {
      if (updated) qc.invalidateQueries({ queryKey: ['messages', id] });
    });
    return () => { cancelled = true; unread.forEach(message => readAttempts.current.delete(message.id)); };
  }, [messages, me?.userId, id, focused, appActive, qc]);

  useEffect(() => {
    if (recorderState.isRecording) {
      recordingWasActive.current = true;
      return;
    }
    if (!recordingWasActive.current || finalizingRecording.current) return;
    recordingWasActive.current = false;
    setRecordingUri(audioRecorder.uri ?? null);
    setVoiceDurationMs(recorderState.durationMillis);
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, [audioRecorder, recorderState.durationMillis, recorderState.isRecording]);

  const send = useMutation({
    mutationFn: (content: string) => chatApi.send(id, content),
    onSuccess: (_message, content) => {
      if (text.trim() === content) updateDraft('');
      qc.invalidateQueries({ queryKey: ['messages', id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: error => Alert.alert('Mesaj gönderilemedi', error.message),
  });

  async function handleSendImage(source: 'camera' | 'library' = 'library') {
    if (uploadingImage) return;
    setUploadingImage(true);
    setImageUploadStage('Fotoğraf seçiliyor…');
    setImageUploadError('');
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error(source === 'camera' ? 'Kamera izni gerekli.' : 'Galeri izni gerekli.');
      const options = {
        mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
        quality: 0.9,
        videoMaxDuration: 60,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const isVideo = asset.type === 'video';
      setImageUploadStage(isVideo ? 'Video hazırlanıyor…' : 'Fotoğraf hazırlanıyor…');
      const mediaFile = isVideo
        ? { uri: asset.uri, fileName: asset.fileName || 'mindmatch-video.mp4', mimeType: 'video/mp4' }
        : await normalizeImageForUpload(asset.uri);
      setImageUploadStage('Sunucuya yükleniyor…');
      const media = await mediaApi.upload(mediaFile.uri, mediaFile.fileName, mediaFile.mimeType, isVideo ? 6 : 2);
      try {
        setImageUploadStage('Mesaj gönderiliyor…');
        const contentTag = !isVideo && hiddenPhotoSending ? '[blur] Gizli fotoğraf' : undefined;
        await chatApi.sendMedia(id, media.id, isVideo ? 4 : 2, contentTag);
      } catch (error) {
        await mediaApi.delete(media.id).catch(() => {});
        throw error;
      }
      if (!isVideo && hiddenPhotoSending) setHiddenPhotoSending(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['messages', id] }),
        qc.invalidateQueries({ queryKey: ['conversations'] }),
      ]);
    } catch (error) {
      const message = uploadFailureMessage(error);
      setImageUploadError(message);
      if (Platform.OS !== 'web') Alert.alert('Medya gönderilemedi', message);
    } finally {
      setUploadingImage(false);
      setImageUploadStage('');
    }
  }

  function choosePhotoOptions(event: GestureResponderEvent) {
    setContextMenu({ kind: 'attachment', anchor: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } });
  }

  function toggleRevealPhoto(messageId: string, mediaAssetId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRevealedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  async function startVoiceRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Mikrofon izni gerekli', 'Sesli mesaj kaydetmek için iPhone ayarlarından MindMatch mikrofon iznini aç.');
        return;
      }
      setRecordingUri(null);
      setVoiceDurationMs(0);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record({ forDuration: 120 });
    } catch (error) {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      Alert.alert('Kayıt başlatılamadı', error instanceof Error ? error.message : 'Mikrofon kullanılamadı.');
    }
  }

  async function stopVoiceRecording() {
    if (!recorderState.isRecording) return;
    finalizingRecording.current = true;
    try {
      setVoiceDurationMs(recorderState.durationMillis);
      await audioRecorder.stop();
      setRecordingUri(audioRecorder.uri ?? null);
    } catch (error) {
      Alert.alert('Kayıt tamamlanamadı', error instanceof Error ? error.message : 'Ses kaydı kaydedilemedi.');
    } finally {
      recordingWasActive.current = false;
      finalizingRecording.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  }

  async function cancelVoiceRecording() {
    if (recorderState.isRecording) {
      finalizingRecording.current = true;
      await audioRecorder.stop().catch(() => {});
      finalizingRecording.current = false;
      recordingWasActive.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    setRecordingUri(null);
    setVoiceDurationMs(0);
  }

  async function sendVoiceMessage() {
    if (!recordingUri || uploadingVoice) return;
    setUploadingVoice(true);
    let mediaId: string | undefined;
    try {
      const webRecording = Platform.OS === 'web';
      const media = await mediaApi.upload(recordingUri, webRecording ? 'mindmatch-voice.webm' : 'mindmatch-voice.m4a', webRecording ? 'audio/webm' : 'audio/mp4', 3);
      mediaId = media.id;
      await chatApi.sendMedia(id, media.id, 3);
      setRecordingUri(null);
      setVoiceDurationMs(0);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['messages', id] }),
        qc.invalidateQueries({ queryKey: ['conversations'] }),
      ]);
    } catch (error) {
      if (mediaId) await mediaApi.delete(mediaId).catch(() => {});
      Alert.alert('Sesli mesaj gönderilemedi', uploadFailureMessage(error));
    } finally {
      setUploadingVoice(false);
    }
  }

  async function startCall(type: number) {
    if (Constants.executionEnvironment === 'storeClient' && Platform.OS !== 'web') {
      Alert.alert('Canlı arama', 'Sesli ve görüntülü arama için MindMatch geliştirme uygulaması gerekir.');
      return;
    }
    try {
      const call = await callApi.start(id, type);
      router.push({ pathname: '/call/[id]', params: { id: call.id, type: String(type), name: name || 'Bağlantı' } });
    } catch (error) {
      Alert.alert('Arama başlatılamadı', error instanceof Error ? error.message : 'Bu görüşme başlatılamadı.');
    }
  }

  async function deleteSelectedMessage(forEveryone: boolean) {
    if (!selectedMessage) return;
    const selected = selectedMessage;
    setSelectedMessage(null);
    setContextMenu(null);
    try {
      if (forEveryone) await chatApi.deleteMessageForEveryone(selected.id);
      else await chatApi.deleteMessage(selected.id);
      await qc.invalidateQueries({ queryKey: ['messages', id] });
    } catch (error) {
      Alert.alert('Mesaj silinemedi', error instanceof Error ? error.message : 'Tekrar dene.');
    }
  }

  function openChatOptions(event: GestureResponderEvent) {
    setContextMenu({ kind: 'chat', anchor: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } });
  }

  async function confirmBlock() {
    setContextMenu(null);
    if (!userId) return;
    try { await blockApi.block(userId); await qc.invalidateQueries(); router.back(); }
    catch (error) { Alert.alert('Engellenemedi', error instanceof Error ? error.message : 'Tekrar dene.'); }
  }

  function hideConversation() {
    if (contextMenu) setContextMenu({ kind: 'confirm-hide', anchor: contextMenu.anchor });
  }

  function endMatch() {
    const match = matches.data?.find(item => item.status === 2 && item.conversationId === id);
    if (!match) { setContextMenu(null); Alert.alert('Eşleşme bulunamadı', 'Bu sohbet için etkin bir eşleşme bulunmuyor.'); return; }
    if (contextMenu) setContextMenu({ kind: 'confirm-end', anchor: contextMenu.anchor });
  }

  async function confirmHideConversation() {
    setContextMenu(null);
    try { await chatApi.hideConversation(id); await qc.invalidateQueries({ queryKey: ['conversations'] }); router.replace('/(tabs)/chats'); }
    catch (error) { Alert.alert('Sohbet gizlenemedi', error instanceof Error ? error.message : 'Tekrar dene.'); }
  }

  async function confirmEndMatch() {
    const match = matches.data?.find(item => item.status === 2 && item.conversationId === id);
    setContextMenu(null);
    if (!match) { Alert.alert('Eşleşme bulunamadı', 'Bu sohbet için etkin bir eşleşme bulunmuyor.'); return; }
    try { await matchApi.end(match.id); await qc.invalidateQueries({ queryKey: ['matches'] }); await qc.invalidateQueries({ queryKey: ['conversations'] }); router.replace('/(tabs)/chats'); }
    catch (error) { Alert.alert('Eşleşme sonlandırılamadı', error instanceof Error ? error.message : 'Tekrar dene.'); }
  }

  const contextMenuActions: ContextMenuAction[] = contextMenu?.kind === 'attachment'
    ? [
        { key: 'camera', label: 'Kamera ile çek', icon: <Camera size={18} color={colors.ink} />, onPress: () => { setContextMenu(null); void handleSendImage('camera'); } },
        { key: 'library', label: 'Fotoğraf veya video seç', icon: <ImagePlus size={18} color={colors.ink} />, onPress: () => { setContextMenu(null); void handleSendImage('library'); } },
      ]
    : contextMenu?.kind === 'chat'
      ? [
          { key: 'calls', label: 'Arama geçmişi', icon: <Phone size={18} color={colors.ink} />, onPress: () => { setContextMenu(null); setCallHistoryVisible(true); } },
          { key: 'profile', label: 'Profili görüntüle', icon: <MessageCircle size={18} color={colors.violetDark} />, onPress: () => { setContextMenu(null); if (userId) router.push({ pathname: '/user/[id]', params: { id: userId } }); } },
          { key: 'hide', label: 'Sohbeti gizle', icon: <Trash2 size={18} color={colors.ink} />, onPress: hideConversation },
          { key: 'end', label: 'Eşleşmeyi sonlandır', destructive: true, icon: <X size={18} color={colors.red} />, onPress: endMatch },
          { key: 'report', label: 'Kişiyi bildir', icon: <Flag size={18} color={colors.coral} />, onPress: () => { setContextMenu(null); if (userId) router.push({ pathname: '/report', params: { userId, conversationId: id } }); } },
          { key: 'block', label: 'Kişiyi engelle', destructive: true, icon: <Shield size={18} color={colors.red} />, onPress: () => { if (contextMenu) setContextMenu({ kind: 'confirm-block', anchor: contextMenu.anchor }); } },
        ]
      : contextMenu?.kind === 'message' && selectedMessage
        ? [
            ...(selectedMessage.senderId !== me?.userId && userId ? [{ key: 'report', label: 'Mesajı bildir', icon: <Flag size={18} color={colors.coral} />, onPress: () => { const messageId = selectedMessage.id; setContextMenu(null); setSelectedMessage(null); router.push({ pathname: '/report', params: { userId, conversationId: id, messageId } }); } }] : []),
            { key: 'delete', label: 'Benden sil', icon: <Trash2 size={18} color={colors.ink} />, onPress: () => { setContextMenu(null); void deleteSelectedMessage(false); } },
            ...(selectedMessage.senderId === me?.userId && !selectedMessage.isDeletedForEveryone ? [{ key: 'delete-all', label: 'Herkesten sil', destructive: true, icon: <X size={18} color={colors.red} />, onPress: () => { if (contextMenu) setContextMenu({ kind: 'confirm-delete-all', anchor: contextMenu.anchor }); } }] : []),
          ]
        : contextMenu?.kind === 'confirm-hide'
          ? [
              { key: 'confirm', label: 'Sohbeti gizle', destructive: true, icon: <Trash2 size={18} color={colors.red} />, onPress: () => { void confirmHideConversation(); } },
              { key: 'cancel', label: 'Vazgeç', icon: <X size={18} color={colors.muted} />, onPress: () => setContextMenu(null) },
            ]
          : contextMenu?.kind === 'confirm-end'
            ? [
                { key: 'confirm', label: 'Eşleşmeyi sonlandır', destructive: true, icon: <X size={18} color={colors.red} />, onPress: () => { void confirmEndMatch(); } },
                { key: 'cancel', label: 'Vazgeç', icon: <X size={18} color={colors.muted} />, onPress: () => setContextMenu(null) },
              ]
            : contextMenu?.kind === 'confirm-block'
              ? [
                  { key: 'confirm', label: 'Kişiyi engelle', destructive: true, icon: <Shield size={18} color={colors.red} />, onPress: () => { void confirmBlock(); } },
                  { key: 'cancel', label: 'Vazgeç', icon: <X size={18} color={colors.muted} />, onPress: () => setContextMenu(null) },
                ]
              : contextMenu?.kind === 'confirm-delete-all'
                ? [
                    { key: 'confirm', label: 'Herkesten sil', destructive: true, icon: <Trash2 size={18} color={colors.red} />, onPress: () => { void deleteSelectedMessage(true); } },
                    { key: 'cancel', label: 'Vazgeç', icon: <X size={18} color={colors.muted} />, onPress: () => { setContextMenu(null); setSelectedMessage(null); } },
                  ]
                : [];

  const contextMenuTitle = contextMenu?.kind === 'confirm-hide' ? 'Sohbeti gizle?'
    : contextMenu?.kind === 'confirm-end' ? 'Eşleşme sonlandırılsın mı?'
      : contextMenu?.kind === 'confirm-block' ? 'Kişiyi engelle?'
        : contextMenu?.kind === 'confirm-delete-all' ? 'Mesaj herkesten silinsin mi?'
          : undefined;
  const contextMenuDetail = contextMenu?.kind === 'confirm-hide' ? 'Yeni mesaj geldiğinde sohbet yeniden görünür.'
    : contextMenu?.kind === 'confirm-end' ? 'Bu işlem sohbeti iki taraf için kapatır.'
      : contextMenu?.kind === 'confirm-block' ? 'Bu kişi sana ulaşamaz ve profilini göremez.'
        : contextMenu?.kind === 'confirm-delete-all' ? 'Mesaj iki tarafın sohbetinden kaldırılır.'
          : undefined;

  if (q.isLoading) return <View style={styles.center}><Loading label="Sohbet açılıyor…" /></View>;
  if (q.error && !q.data) return <View style={styles.center}><Empty icon={<RefreshCw size={24} color={colors.violetDark} />} title="Sohbet yüklenemedi" detail={q.error.message} action={<Button title="Tekrar dene" onPress={() => { void q.refetch(); }} />} /><Button title="Geri dön" variant="ghost" onPress={() => router.back()} /></View>;

  return (
    <>
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <SoftSurface animate style={styles.headerButton}><Pressable accessibilityLabel="Geri dön" hitSlop={4} onPress={() => router.back()} style={styles.headerControl}><ArrowLeft size={20} color={colors.ink} /></Pressable></SoftSurface>
        <SoftSurface animate style={styles.identity}>
          <Pressable accessibilityRole="button" accessibilityLabel="Profili görüntüle" onPress={() => userId && router.push({ pathname: '/user/[id]', params: { id: userId } })} style={styles.identityContent}>
            <Avatar name={displayName} mediaAssetId={primaryPhoto?.mediaAssetId} size={38} online={Boolean(presence.data?.isOnline)} />
            <View style={styles.identityText}>
              <Text numberOfLines={1} style={styles.headerName}>{displayName}</Text>
              {isOtherTyping || presence.data?.isOnline || presence.data?.lastSeenAtUtc ? <Text numberOfLines={1} style={presence.data?.isOnline ? styles.headerOnlineText : styles.headerLastSeenText}>{isOtherTyping ? 'Yazıyor…' : presence.data?.isOnline ? 'Çevrimiçi' : `Son görülme ${new Date(presence.data!.lastSeenAtUtc!).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</Text> : null}
            </View>
          </Pressable>
        </SoftSurface>
        <SoftSurface animate style={styles.headerActions}>
          <Pressable accessibilityLabel="Sesli arama" hitSlop={2} onPress={() => startCall(1)} style={styles.headerActionButton}><Phone size={17} color={colors.ink} /></Pressable>
          <Pressable accessibilityLabel="Görüntülü arama" hitSlop={2} onPress={() => startCall(2)} style={styles.headerActionButton}><Video size={18} color={colors.ink} /></Pressable>
          <Pressable accessibilityLabel="Sohbet seçenekleri" hitSlop={2} onPress={openChatOptions} style={styles.headerActionButton}><MoreHorizontal size={19} color={colors.ink} /></Pressable>
        </SoftSurface>
      </View>

      {/* Messages FlatList */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={message => message.id}
        initialNumToRender={16}
        maxToRenderPerBatch={10}
        windowSize={7}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        contentContainerStyle={styles.messagesContainer}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!hasInitialScroll.current && messages.length) {
            hasInitialScroll.current = true;
            listRef.current?.scrollToEnd({ animated: false });
          }
        }}
        ListHeaderComponent={q.hasNextPage ? <Pressable accessibilityRole="button" disabled={q.isFetchingNextPage} onPress={() => { void loadOlderMessages(); }} style={styles.olderMessages}><Text style={styles.olderMessagesText}>{q.isFetchingNextPage ? 'Yükleniyor…' : 'Önceki mesajlar'}</Text></Pressable> : null}
        renderItem={({ item }) => {
          const mine = item.senderId === me?.userId;
          const isBlurredPhoto = item.type === 2 && item.content?.includes('[blur]') && !revealedPhotos.has(item.id);
          const isPhoto = item.type === 2 && Boolean(item.mediaAssetId);

          return (
            <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirRow]}>
              <Pressable delayLongPress={350} onLongPress={event => { setSelectedMessage(item); setContextMenu({ kind: 'message', anchor: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } }); }} style={[styles.bubble, mine ? styles.mineBubble : styles.theirBubble]}>
                {item.isDeletedForEveryone ? (
                  <Text style={[styles.deletedText, mine && styles.deletedTextMine]}>Bu mesaj silindi</Text>
                ) : (
                  <>
                    {/* Photo Message */}
                    {isPhoto && item.mediaAssetId ? (
                      <View style={styles.photoContainer}>
                        <Pressable
                          onPress={() => {
                            if (isBlurredPhoto) {
                              toggleRevealPhoto(item.id, item.mediaAssetId!);
                            } else {
                              setLightboxMediaId(item.mediaAssetId);
                            }
                          }}
                        >
                          <ProtectedImage
                            mediaAssetId={item.mediaAssetId}
                            blurRadius={isBlurredPhoto ? 35 : 0}
                            style={styles.messageImage}
                          />
                          {isBlurredPhoto ? (
                            <View style={styles.blurOverlay}>
                              <View style={styles.blurBadge}>
                                <EyeOff size={18} color={colors.white} strokeWidth={2.2} />
                                <Text style={styles.blurTitle}>Gizli Fotoğraf</Text>
                                <Text style={styles.blurSubtitle}>Görüntülemek için dokun</Text>
                              </View>
                            </View>
                          ) : item.content?.includes('[blur]') ? (
                            <Pressable style={styles.reblurButton} onPress={() => toggleRevealPhoto(item.id, item.mediaAssetId!)}>
                              <Eye size={12} color={colors.white} />
                              <Text style={styles.reblurText}>Gizle</Text>
                            </Pressable>
                          ) : null}
                        </Pressable>
                      </View>
                    ) : null}

                    {item.type === 4 && item.mediaAssetId ? (
                      <VideoMessage mediaAssetId={item.mediaAssetId} />
                    ) : null}

                    {/* Voice Message */}
                    {item.type === 3 && item.mediaAssetId ? (
                      <VoiceMessage mediaAssetId={item.mediaAssetId} mine={mine} />
                    ) : null}

                    {/* Text Message */}
                    {item.content && !item.content.startsWith('[blur]') ? (
                      <Text style={[styles.messageText, mine ? styles.mineText : styles.theirText]}>
                        {item.content}
                      </Text>
                    ) : null}
                  </>
                )}

                {/* Metadata & Status */}
                <View style={styles.messageMeta}>
                  <Text style={[styles.messageTime, mine ? styles.mineTime : styles.theirTime]}>
                    {new Date(item.createdAtUtc).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {mine && !item.isDeletedForEveryone ? (
                    item.status >= 3 ? (
                      <CheckCheck size={14} color={colors.ink} strokeWidth={2.4} />
                    ) : item.status === 2 ? (
                      <CheckCheck size={14} color={colors.ink} strokeWidth={2.2} />
                    ) : (
                      <Check size={13} color={colors.ink} strokeWidth={2.2} />
                    )
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Sparkles size={24} color={colors.violetDark} />
            </View>
            <Text style={styles.emptyTitle}>Sohbet burada başlıyor</Text>
            <Text style={styles.emptyText}>İlk mesajı göndererek samimi ve derin bir bağ kurabilirsin.</Text>
          </Card>
        }
      />

      {/* Upload Stage / Error Banner */}
      {uploadingImage ? (
        <View style={styles.statusBanner}>
          <ActivityIndicator size="small" color={colors.violetDark} />
          <Text style={styles.statusText}>{imageUploadStage}</Text>
        </View>
      ) : null}
      {imageUploadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{imageUploadError}</Text>
        </View>
      ) : null}

      {/* Production Composer Bar */}
      <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* Fotoğraf Ekleme Butonu */}
        <Pressable
          accessibilityLabel="Fotoğraf ekle"
          onPress={choosePhotoOptions}
          disabled={recorderState.isRecording || !!recordingUri || uploadingVoice || uploadingImage}
          style={styles.composerActionButton}
        >
          {uploadingImage ? (
            <ActivityIndicator size="small" color={colors.violetDark} />
          ) : (
            <ImagePlus color={colors.violetDark} size={21} strokeWidth={2.2} />
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hiddenPhotoSending ? 'Gizli fotoğraf gönderimi açık' : 'Gizli fotoğraf gönderimini aç'}
          accessibilityState={{ selected: hiddenPhotoSending }}
          onPress={() => setHiddenPhotoSending(value => !value)}
          disabled={recorderState.isRecording || !!recordingUri || uploadingImage}
          style={[styles.hiddenPhotoToggle, hiddenPhotoSending && styles.hiddenPhotoToggleActive]}
        >
          <EyeOff size={16} color={hiddenPhotoSending ? colors.violetDark : colors.muted} />
        </Pressable>

        {/* Input veya Voice Draft */}
        {recorderState.isRecording ? (
          <View style={styles.voiceDraftWrap}>
            <View style={styles.voicePulsingDot} />
            <Text style={styles.voiceDraftText}>Ses kaydediliyor · {formatDuration(recorderState.durationMillis)}</Text>
          </View>
        ) : recordingUri ? (
          <View style={styles.voiceDraftWrap}>
            <Mic color={colors.violetDark} size={17} />
            <Text style={styles.voiceDraftText}>Sesli mesaj hazır · {formatDuration(voiceDurationMs)}</Text>
          </View>
        ) : (
          <TextInput
            value={text}
            onChangeText={updateDraft}
            placeholder="Mesaj yaz…"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={2000}
            style={styles.textInput}
          />
        )}

        {/* Aksiyon Butonları */}
        {recorderState.isRecording ? (
          <View style={styles.composerButtonsRow}>
            <Pressable accessibilityLabel="Kaydı iptal et" onPress={cancelVoiceRecording} style={styles.voiceCancelButton}>
              <X color={colors.muted} size={19} />
            </Pressable>
            <Pressable accessibilityLabel="Kaydı bitir" onPress={stopVoiceRecording} style={styles.voiceStopButton}>
              <Square color={colors.onAccent} size={15} fill={colors.white} />
            </Pressable>
          </View>
        ) : recordingUri ? (
          <View style={styles.composerButtonsRow}>
            <Pressable accessibilityLabel="Kaydı sil" onPress={cancelVoiceRecording} disabled={uploadingVoice} style={styles.voiceCancelButton}>
              <Trash2 color={colors.red} size={18} />
            </Pressable>
            <Pressable accessibilityLabel="Sesli mesajı gönder" onPress={sendVoiceMessage} disabled={uploadingVoice} style={styles.sendButton}>
              {uploadingVoice ? <ActivityIndicator color={colors.onAccent} size="small" /> : <Send color={colors.onAccent} size={17} />}
            </Pressable>
          </View>
        ) : (
          <View style={styles.composerButtonsRow}>
            <Pressable accessibilityLabel="Sesli mesaj kaydet" onPress={startVoiceRecording} disabled={uploadingImage} style={styles.micButton}>
              <Mic color={colors.violetDark} size={20} strokeWidth={2.2} />
            </Pressable>
            <Pressable
              accessibilityLabel="Mesaj gönder"
              disabled={!text.trim() || send.isPending || uploadingImage}
              onPress={() => send.mutate(text.trim())}
              style={[styles.sendButton, (!text.trim() || send.isPending || uploadingImage) && styles.sendButtonDisabled]}
            >
              <Send color={colors.onAccent} size={17} strokeWidth={2.4} />
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>

    {/* Fullscreen Photo Lightbox Modal */}
    <Modal visible={Boolean(lightboxMediaId)} transparent animationType="fade" onRequestClose={() => setLightboxMediaId(null)}>
      <View style={styles.lightboxBackdrop}>
        <View style={[styles.lightboxHeader, { paddingTop: Math.max(insets.top, 14) }]}>
          <Text style={styles.lightboxTitle}>Fotoğraf</Text>
          <Pressable onPress={() => setLightboxMediaId(null)} style={styles.lightboxClose}>
            <X size={22} color={colors.onAccent} />
          </Pressable>
        </View>
        <View style={styles.lightboxBody}>
          {lightboxMediaId ? (
            <ProtectedImage mediaAssetId={lightboxMediaId} contentFit="contain" style={styles.lightboxImage} />
          ) : null}
        </View>
      </View>
    </Modal>

    {/* Options ActionSheet Modal */}
    <Modal
      transparent
      visible={Boolean(callHistoryVisible)}
      animationType="fade"
      onRequestClose={() => { setCallHistoryVisible(false); }}
    >
      <View style={styles.actionSheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setCallHistoryVisible(false)} />
        <View style={[styles.actionSheetCard, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {callHistoryVisible ? <>
            <Text style={styles.sheetTitle}>Aramalar</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {callHistory.isLoading ? <ActivityIndicator color={colors.violetDark} /> : callHistory.error ? <Text style={styles.sheetDesc}>{callHistory.error.message}</Text> : !callHistory.data?.length ? <Text style={styles.sheetDesc}>Henüz arama yok.</Text> : callHistory.data.map(call => <View key={call.id} style={styles.sheetActionItem}>
                {call.type === 2 ? <Video size={18} color={colors.violetDark} /> : <Phone size={18} color={colors.violetDark} />}
                <View style={{ flex: 1 }}><Text style={styles.sheetActionText}>{call.callerId === me?.userId ? 'Giden' : 'Gelen'} · {({ 1: 'Çalıyor', 2: 'Yanıtlandı', 3: 'Reddedildi', 4: 'Cevapsız', 5: 'Sonlandı' } as Record<number, string>)[call.status]}</Text><Text style={styles.sheetDesc}>{new Date(call.startedAtUtc).toLocaleString('tr-TR')}</Text></View>
              </View>)}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setCallHistoryVisible(false)} style={styles.sheetCancelItem}><Text style={styles.sheetCancelText}>Kapat</Text></Pressable>
          </> : null}
        </View>
      </View>
    </Modal>
    <ContextMenu
      visible={Boolean(contextMenu)}
      anchor={contextMenu?.anchor ?? null}
      actions={contextMenuActions}
      title={contextMenuTitle}
      detail={contextMenuDetail}
      onClose={() => { setContextMenu(null); setSelectedMessage(null); }}
    />
    </>
  );
}

function VoiceMessage({ mediaAssetId, mine }: { mediaAssetId: string; mine: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const mounted = useRef(true);
  const loaded = useRef(false);
  const objectUrl = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeVoicePlayer === player) activeVoicePlayer = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [player]);

  async function togglePlayback() {
    if (status.playing) {
      try { player.pause(); } catch { /* The native player may be releasing. */ }
      if (activeVoicePlayer === player) activeVoicePlayer = null;
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const token = await sessionTokens.access();
      if (!mounted.current) return;
      if (!token) throw new Error('Oturum süresi dolmuş. Yeniden giriş yap.');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix' });
      if (!mounted.current) return;
      if (!loaded.current) {
        if (Platform.OS === 'web') {
          const response = await fetch(`${API_URL}/api/media/${mediaAssetId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) throw new Error('Ses dosyası yüklenemedi.');
          const blob = await response.blob();
          if (!mounted.current) return;
          objectUrl.current = URL.createObjectURL(blob);
          player.replace(objectUrl.current);
        } else {
          player.replace({ uri: `${API_URL}/api/media/${mediaAssetId}`, headers: { Authorization: `Bearer ${token}` } });
        }
        loaded.current = true;
      }
      if (!mounted.current) return;
      if (activeVoicePlayer && activeVoicePlayer !== player) {
        try { activeVoicePlayer.pause(); } catch { /* A previous row may have unmounted. */ }
      }
      activeVoicePlayer = player;
      if (status.didJustFinish) player.seekTo(0);
      player.play();
    } catch {
      if (activeVoicePlayer === player) activeVoicePlayer = null;
      if (mounted.current) {
        setFailed(true);
        Alert.alert('Ses açılamadı', 'Sesli mesaj indirilemedi. İnternet bağlantını kontrol edip tekrar dene.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  const duration = status.duration > 0 ? status.duration * 1000 : 0;
  const position = status.currentTime * 1000;
  const label = duration ? `${formatDuration(position)} / ${formatDuration(duration)}` : failed ? 'Tekrar dene' : 'Sesli mesaj';

  return (
    <View style={styles.voiceMessageContainer}>
      <Pressable
        accessibilityLabel={status.playing ? 'Durdur' : 'Dinle'}
        onPress={togglePlayback}
        style={[styles.voicePlayBtn, mine ? styles.voicePlayBtnMine : styles.voicePlayBtnTheir]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={mine ? colors.violet : colors.onAccent} />
        ) : status.playing ? (
          <Pause color={mine ? colors.violet : colors.onAccent} size={16} fill={mine ? colors.violet : colors.onAccent} />
        ) : (
          <Play color={mine ? colors.violet : colors.onAccent} size={16} fill={mine ? colors.violet : colors.onAccent} />
        )}
      </Pressable>
      <View style={styles.voiceProgressWrap}>
        <View style={[styles.voiceTrack, mine && styles.voiceTrackMine]}>
          <View style={[styles.voiceFill, { width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }]} />
        </View>
        <Text style={[styles.voiceTimeLabel, mine && styles.voiceTimeLabelMine]}>{label}</Text>
      </View>
    </View>
  );
}

function VideoMessage({ mediaAssetId }: { mediaAssetId: string }) {
  const player = useVideoPlayer(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    freshAccessToken().then(token => {
      if (!mounted.current || !token) return;
      player.replace({ uri: `${API_URL}/api/media/${mediaAssetId}`, headers: { Authorization: `Bearer ${token}` } });
    }).catch(() => {});
    return () => {
      mounted.current = false;
      try { player.pause(); } catch { /* The native player may already be releasing. */ }
    };
  }, [mediaAssetId, player]);

  return <VideoView player={player} style={{ width: 236, height: 300, borderRadius: 18, overflow: 'hidden' }} nativeControls contentFit="cover" />;
}

function formatDuration(durationMs: number) {
  const seconds = Math.floor(Math.max(0, durationMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const useStyles = createThemedStyles(colors => ({
  olderMessages: { alignSelf: 'center', minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', marginBottom: 8 },
  olderMessagesText: { color: colors.violetDark, fontSize: 12, fontWeight: '600' },
  page: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },

  // Floating controls remain in normal flow so names cannot cover messages.
  header: { zIndex: 4, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  headerButton: { width: 40, height: 44, borderRadius: 22 },
  headerControl: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, borderRadius: 24 },
  identityContent: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6 },
  identityText: { flex: 1, minWidth: 0, gap: 3 },
  headerName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  headerOnlineText: { fontSize: 10, color: colors.muted },
  headerLastSeenText: { fontSize: 10, color: colors.muted },
  headerActions: { flexDirection: 'row', alignItems: 'center', borderRadius: 24 },
  headerActionButton: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },

  // Messages Container
  messagesContainer: {
    paddingHorizontal: 14,
    paddingVertical: 18,
    gap: 10,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  bubbleRow: {
    width: '100%',
    flexDirection: 'row',
  },
  mineRow: {
    justifyContent: 'flex-end',
  },
  theirRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  mineBubble: {
    backgroundColor: colors.accentSurface,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  mineText: {
    color: colors.ink,
    fontWeight: '500',
  },
  theirText: {
    color: colors.ink,
    fontWeight: '500',
  },
  deletedText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.muted,
  },
  deletedTextMine: {
    color: colors.ink,
  },

  // Photo
  photoContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 4,
  },
  messageImage: {
    width: 230,
    height: 250,
    borderRadius: 16,
    backgroundColor: colors.paleViolet,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000060',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  blurBadge: {
    backgroundColor: '#151712CC',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF25',
  },
  blurTitle: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  blurSubtitle: {
    color: '#E9ECE2',
    fontSize: 10,
    fontWeight: '600',
  },
  reblurButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#000000AA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  reblurText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '600',
  },

  // Message Metadata
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  messageTime: {
    fontSize: 9,
    fontWeight: '600',
  },
  mineTime: {
    color: colors.ink,
  },
  theirTime: {
    color: colors.muted,
  },

  // Voice Player
  voiceMessageContainer: {
    width: 215,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 3,
  },
  voicePlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayBtnMine: {
    backgroundColor: colors.surface,
  },
  voicePlayBtnTheir: {
    backgroundColor: colors.violet,
  },
  voiceProgressWrap: {
    flex: 1,
    gap: 5,
  },
  voiceTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  voiceTrackMine: {
    backgroundColor: '#FFFFFF45',
  },
  voiceFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.violet,
  },
  voiceTimeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.muted,
  },
  voiceTimeLabelMine: {
    color: colors.ink,
  },

  // Empty Card
  emptyCard: {
    alignSelf: 'center',
    marginVertical: 40,
    maxWidth: 290,
    alignItems: 'center',
    padding: 24,
    borderRadius: 22,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.paleViolet,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 6,
  },

  // Banners
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.paleViolet,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  statusText: {
    color: colors.violetDark,
    fontSize: 11,
    fontWeight: '700',
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.paleCoral,
  },
  errorText: {
    color: colors.red,
    fontSize: 11,
    fontWeight: '700',
  },

  // Composer
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: colors.canvas,
  },
  composerActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenPhotoToggle: {
    width: 30,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenPhotoToggleActive: {
    backgroundColor: colors.paleViolet,
  },
  textInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 115,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 20,
    fontSize: 14,
    color: colors.ink,
  },
  voiceDraftWrap: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.paleViolet,
  },
  voicePulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.coral,
  },
  voiceDraftText: {
    flex: 1,
    fontSize: 12,
    color: colors.ink,
    fontWeight: '700',
  },
  composerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.violet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
  },
  voiceCancelButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceStopButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Lightbox Modal
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000000F8',
    justifyContent: 'center',
  },
  lightboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  lightboxTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  lightboxClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },

  // ActionSheet
  actionSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#00000070',
  },
  actionSheetCard: {
    padding: 22,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 6,
  },
  sheetDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 12,
  },
  sheetActionItem: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sheetActionText: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '700',
  },
  sheetActionTextDanger: {
    fontSize: 13,
    color: colors.red,
    fontWeight: '600',
  },
  sheetCancelItem: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  sheetCancelText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
}));
