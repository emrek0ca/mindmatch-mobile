import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Radio, SwitchCamera, Video } from '../../components/icons';
import { useMutation } from '@tanstack/react-query';
import { callApi } from '../../api/mindmatch';
import { connectCalls } from '../../realtime/hub';
import { useTheme, createThemedStyles } from '../../theme/tokens';

const expoGo = Constants.executionEnvironment === 'storeClient' && Platform.OS !== 'web';

type Peer = RTCPeerConnection;
type Media = MediaStream & { toURL?: () => string };
type RtcViewProps = { streamURL: string; style?: object; objectFit?: 'cover' | 'contain'; mirror?: boolean };
type IceCandidateInit = { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
type SessionDescriptionInit = { sdp: string; type: string | null };

export default function CallScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const { id, type, name, incoming } = useLocalSearchParams<{ id: string; type: string; name?: string; incoming?: string }>();
  const isVideo = type === '2';
  const insets = useSafeAreaInsets();
  const isIncoming = incoming === 'true';
  const [message, setMessage] = useState(expoGo ? 'Bu sürümde canlı arama kullanılamıyor.' : isIncoming ? 'Aramaya hazırlanıyor…' : 'Karşı tarafın yanıtı bekleniyor…');
  const [connected, setConnected] = useState(false);
  const [isMuted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(isVideo);
  const [rtcView, setRtcView] = useState<ComponentType<RtcViewProps> | null>(null);
  const [localStream, setLocalStream] = useState<Media | null>(null);
  const [remoteStream, setRemoteStream] = useState<Media | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<Media | null>(null);
  const hubRef = useRef<Awaited<ReturnType<typeof connectCalls>>>(null);
  const candidateQueue = useRef<IceCandidateInit[]>([]);
  const disposed = useRef(false);
  const answered = useRef(false);
  const offerStarted = useRef(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function setRemoteDescriptionAndDrain(description: SessionDescriptionInit) {
    const peer = peerRef.current;
    if (!peer) return;
    await peer.setRemoteDescription(description as RTCSessionDescriptionInit);
    const candidates = candidateQueue.current.splice(0);
    await Promise.all(candidates.map(candidate => peer.addIceCandidate(candidate).catch(() => {})));
  }

  const startOffer = useCallback(async () => {
    if (offerStarted.current) return;
    const peer = peerRef.current;
    const hub = hubRef.current;
    if (!peer || !hub || !streamRef.current) return;
    offerStarted.current = true;
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await hub.invoke('SendOffer', id, JSON.stringify(peer.localDescription));
      if (!disposed.current) setMessage('Bağlantı kuruluyor…');
    } catch (error) {
      offerStarted.current = false;
      if (!disposed.current) setMessage(error instanceof Error ? error.message : 'Arama teklifi gönderilemedi.');
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    const removeHandlers: (() => void)[] = [];
    let finishing = false;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (label: string) => {
      if (!active || finishing) return;
      finishing = true;
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = null;
      setMessage(label);
      finishTimer = setTimeout(() => { if (active) router.back(); }, 900);
    };
    disposed.current = false;
    if (expoGo) {
      if (isIncoming) callApi.reject(id).catch(() => {});
      return () => { active = false; disposed.current = true; };
    }

    async function setup() {
      try {
        const rtc = Platform.OS === 'web' ? null : await import('react-native-webrtc');
        if (!active) return;
        if (rtc) setRtcView(() => rtc.RTCView as ComponentType<RtcViewProps>);
        const hub = await connectCalls();
        if (!hub || !active || hub.state !== 'Connected') throw new Error('Arama sunucusuna bağlanılamadı.');
        hubRef.current = hub;
        const listen = (event: string, handler: (...args: any[]) => void) => {
          hub.on(event, handler);
          removeHandlers.push(() => hub.off(event, handler));
        };

        listen('CallAccepted', async (call: { id?: string }) => {
          if (call.id === id && !isIncoming) await startOffer();
        });
        listen('CallRejected', (call: { id?: string }) => {
          if (call.id === id) finish('Arama yanıtlanmadı.');
        });
        listen('CallEnded', (call: { id?: string }) => {
          if (call.id === id) finish('Arama sona erdi.');
        });
        listen('CallMissed', (call: { id?: string }) => {
          if (call.id === id) finish('Arama yanıtlanmadı.');
        });
        listen('CallOffer', async (signal: { callId?: string; payload?: string }) => {
          if (!isIncoming || signal.callId !== id || !signal.payload || !peerRef.current) return;
          try {
            await setRemoteDescriptionAndDrain(JSON.parse(signal.payload));
            const answer = await peerRef.current.createAnswer();
            await peerRef.current.setLocalDescription(answer);
            await hub.invoke('SendAnswer', id, JSON.stringify(peerRef.current.localDescription));
            setMessage('Karşı taraf bağlanıyor…');
          } catch (error) { setMessage(error instanceof Error ? error.message : 'Aramaya katılınamadı.'); }
        });
        listen('CallAnswer', async (signal: { callId?: string; payload?: string }) => {
          if (isIncoming || signal.callId !== id || !signal.payload) return;
          try { await setRemoteDescriptionAndDrain(JSON.parse(signal.payload)); }
          catch (error) { setMessage(error instanceof Error ? error.message : 'Arama yanıtı alınamadı.'); }
        });
        listen('CallIceCandidate', async (signal: { callId?: string; payload?: string }) => {
          if (signal.callId !== id || !signal.payload) return;
          try {
            const candidate = JSON.parse(signal.payload);
            if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(candidate);
            else candidateQueue.current.push(candidate);
          } catch { /* Ignore malformed or late ICE signals. */ }
        });

        const credentials = await callApi.credentials();
        if (!active) return;
        const peer = (rtc ? new rtc.RTCPeerConnection({
          iceTransportPolicy: 'relay',
          iceServers: [{ urls: credentials.urls, username: credentials.username, credential: credentials.credential }],
        }) : new RTCPeerConnection({
          iceTransportPolicy: 'relay',
          iceServers: [{ urls: credentials.urls, username: credentials.username, credential: credentials.credential }],
        })) as unknown as Peer;
        peerRef.current = peer;
        peer.onicecandidate = rawEvent => {
          const event = rawEvent as unknown as { candidate: RTCIceCandidate | null };
          if (event.candidate && hub.state === 'Connected') hub.invoke('SendIceCandidate', id, JSON.stringify(event.candidate.toJSON())).catch(() => {});
        };
        peer.ontrack = rawEvent => {
          const event = rawEvent as unknown as { streams: MediaStream[] };
          if (event.streams[0]) setRemoteStream(event.streams[0] as Media);
        };
        peer.onconnectionstatechange = () => {
          if (!active) return;
          setConnected(peer.connectionState === 'connected');
          if (peer.connectionState === 'connected') setMessage('Görüşme başladı');
          if (peer.connectionState === 'failed') setMessage('Bağlantı kurulamadı. Tekrar aramayı deneyin.');
          if (peer.connectionState === 'disconnected') setMessage('Bağlantı kesildi, yeniden bağlanılıyor…');
        };

        const videoConstraints = isVideo ? { facingMode: 'user', width: 720, height: 1280, frameRate: 24 } : false;
        const stream = (rtc
          ? await rtc.mediaDevices.getUserMedia({ audio: true, video: videoConstraints } as any)
          : await navigator.mediaDevices.getUserMedia({ audio: true, video: videoConstraints })) as unknown as Media;
        if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        setLocalStream(stream);
        stream.getTracks().forEach(track => peer.addTrack(track, stream));
        if (isIncoming && !answered.current) {
          await callApi.answer(id);
          answered.current = true;
          setMessage('Arama yanıtlandı, bağlanıyor…');
        }
        const updateCallState = async () => {
          if (!active || finishing) return;
          let nextDelay = 3000;
          try {
            const call = await callApi.status(id);
            if (!active || finishing) return;
            if (call.status === 2) {
              nextDelay = 15000;
              if (!isIncoming) await startOffer();
            } else if (call.status >= 3) finish(call.status === 3 ? 'Arama reddedildi.' : call.status === 4 ? 'Arama yanıtlanmadı.' : 'Arama sona erdi.');
          } catch { /* Retry only after this request completes. */ }
          if (active && !finishing) statusTimer.current = setTimeout(() => { void updateCallState(); }, nextDelay);
        };
        await updateCallState();
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Arama başlatılamadı.');
          if (isIncoming) callApi.reject(id).catch(() => {});
          else callApi.end(id).catch(() => {});
        }
      }
    }

    setup();
    return () => {
      active = false;
      disposed.current = true;
      if (statusTimer.current) clearTimeout(statusTimer.current);
      if (finishTimer) clearTimeout(finishTimer);
      statusTimer.current = null;
      peerRef.current?.close();
      peerRef.current = null;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      removeHandlers.forEach(remove => remove());
      hubRef.current = null;
    };
  }, [id, isIncoming, isVideo, startOffer]);

  const end = useMutation({
    mutationFn: () => isIncoming && !answered.current ? callApi.reject(id) : callApi.end(id),
    onSettled: () => { if (!disposed.current) router.back(); },
    onError: error => { if (!disposed.current) Alert.alert('Arama kapatılamadı', error.message); },
  });

  function toggleMic() {
    const next = !isMuted;
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  }
  function toggleCamera() {
    const next = !cameraEnabled;
    streamRef.current?.getVideoTracks().forEach(track => { track.enabled = next; });
    setCameraEnabled(next);
  }
  function switchCamera() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    if (Platform.OS === 'web') {
      const facingMode = track.getSettings().facingMode === 'environment' ? 'user' : 'environment';
      track.applyConstraints({ facingMode }).catch(() => setMessage('Bu kamera yönü kullanılamıyor.'));
      return;
    }
    (track as any)._switchCamera?.();
  }

  if (expoGo) return <View style={[styles.page, { paddingTop: insets.top + 27, paddingBottom: insets.bottom + 27 }]}>
    <View style={styles.orbit}><View style={styles.orbitInner}><View style={styles.avatar}><Video size={31} color={colors.onAccent} /></View></View></View>
    <Text style={styles.name}>Canlı arama için geliştirme uygulaması gerekiyor</Text>
    <Text style={styles.status}>Expo Go telefonun mikrofonu ve kamerasını bu arama akışına bağlayamıyor. Sesli ve görüntülü arama, WebRTC içeren MindMatch geliştirme sürümünde kullanılacak.</Text>
    <Pressable onPress={() => router.back()} style={styles.hangup}><PhoneOff size={20} color={colors.white} /><Text style={styles.hangText}>Geri dön</Text></Pressable>
  </View>;

  const hasRemoteVideo = Boolean(isVideo && remoteStream);
  const controlColor = hasRemoteVideo ? colors.white : colors.ink;
  const StreamView = rtcView;
  const remoteUrl = remoteStream?.toURL?.();
  const localUrl = localStream?.toURL?.();
  return <View style={styles.page}>
    {Platform.OS === 'web' && isVideo && remoteStream ? <BrowserVideo stream={remoteStream} style={StyleSheet.absoluteFill} /> : null}
    {Platform.OS === 'web' && isVideo && localStream ? <BrowserVideo stream={localStream} muted style={[styles.localVideo, { top: insets.top + 12 }]} /> : null}
    {isVideo && remoteUrl && StreamView ? <StreamView streamURL={remoteUrl} style={StyleSheet.absoluteFill} objectFit="cover" /> : null}
    {isVideo && localUrl && StreamView ? <StreamView streamURL={localUrl} style={[styles.localVideo, { top: insets.top + 12 }]} objectFit="cover" mirror /> : null}
    <View style={[styles.overlay, { backgroundColor: hasRemoteVideo ? '#00000033' : 'transparent', paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} pointerEvents="box-none">
      <View style={styles.person}>
        {!hasRemoteVideo ? <View style={styles.orbit}><View style={styles.orbitInner}><View style={styles.avatar}><Text style={styles.initial}>{(name || 'M').slice(0, 1).toUpperCase()}</Text></View></View></View> : null}
        <Text style={[styles.name, hasRemoteVideo && { color: colors.white }]}>{name || 'MindMatch kullanıcısı'}</Text>
        <Text style={[styles.status, hasRemoteVideo && { color: colors.white }]}>{message}</Text>
        <View style={styles.badge}><Radio size={13} color={connected ? colors.green : controlColor} /><Text style={styles.badgeText}>{connected ? 'Bağlandı' : 'Bağlantı kuruluyor'}</Text></View>
        <View style={styles.callMark}>{isVideo ? <Video size={18} color={controlColor} /> : <Mic size={18} color={controlColor} />}<Text style={[styles.callType, hasRemoteVideo && { color: colors.white }]}>{isVideo ? 'Görüntülü arama' : 'Sesli arama'}</Text></View>
      </View>
      <View style={styles.controls}>
        <Control icon={isMuted ? <MicOff color={colors.ink} size={20}/> : <Mic color={colors.ink} size={20}/>} title={isMuted ? 'Sesi aç' : 'Sessize al'} onPress={toggleMic} active={isMuted} />
        {isVideo ? <Control icon={cameraEnabled ? <Camera color={colors.ink} size={20}/> : <CameraOff color={colors.ink} size={20}/>} title={cameraEnabled ? 'Kamerayı kapat' : 'Kamerayı aç'} onPress={toggleCamera} active={!cameraEnabled} /> : null}
        {isVideo ? <Control icon={<SwitchCamera color={colors.ink} size={20}/>} title="Kamerayı çevir" onPress={switchCamera} /> : null}
        <Pressable onPress={() => end.mutate()} disabled={end.isPending} style={styles.hangup}><PhoneOff size={20} color={colors.white}/><Text style={styles.hangText}>Bitir</Text></Pressable>
      </View>
    </View>
  </View>;
}

function BrowserVideo({ stream, style, muted = false }: { stream: MediaStream; style: object; muted?: boolean }) {
  return createElement('video', {
    ref: (video: HTMLVideoElement | null) => {
      if (!video) return;
      video.srcObject = stream;
      void video.play().catch(() => {});
    },
    autoPlay: true,
    playsInline: true,
    muted,
    style,
  });
}

function Control({ icon, title, onPress, active = false }: { icon: React.ReactNode; title: string; onPress: () => void; active?: boolean }) {
  const styles = useStyles();

  return <Pressable onPress={onPress} style={styles.control}><View style={[styles.controlIcon, active && styles.controlActive]}>{icon}</View><Text style={styles.controlTitle}>{title}</Text></Pressable>;
}

const useStyles = createThemedStyles(colors => ({
  page: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 27 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between', alignItems: 'center', paddingTop: 95, paddingBottom: 62, backgroundColor: 'transparent' },
  person: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  orbit: { width: 194, height: 194, borderRadius: 100, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  orbitInner: { width: 152, height: 152, borderRadius: 80, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 100, height: 100, borderRadius: 35, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 44, color: colors.onAccent, fontWeight: '700' },
  name: { fontSize: 21, color: colors.ink, fontWeight: '700', marginTop: 25, textAlign: 'center' },
  status: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18, textAlign: 'center', maxWidth: 320 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.surface },
  badgeText: { fontSize: 10, color: colors.muted, fontWeight: '600' },
  callMark: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 }, callType: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  localVideo: { position: 'absolute', zIndex: 1, right: 17, top: 58, width: 112, height: 162, borderRadius: 20, overflow: 'hidden', backgroundColor: '#151712' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' },
  control: { alignItems: 'center', gap: 7 }, controlIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  controlActive: { backgroundColor: colors.coral }, controlTitle: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  hangup: { height: 54, paddingHorizontal: 16, borderRadius: 27, backgroundColor: colors.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  hangText: { fontSize: 13, color: colors.white, fontWeight: '600' },
}));
