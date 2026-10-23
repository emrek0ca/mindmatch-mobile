import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, Shield, Sparkles, User } from '../components/icons';
import * as Haptics from 'expo-haptics';
import { accountApi, interestApi, musicApi, profileApi } from '../api/mindmatch';
import { Button, Card, Field, Loading, Screen } from '../components/ui';
import { useTheme, createThemedStyles } from '../theme/tokens';
import { useSession } from '../state/session';
import { useAppearance, type AppearancePreference } from '../state/appearance';

type SettingsTab = 'profile' | 'privacy' | 'preferences';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const qc = useQueryClient();
  const appearance = useAppearance(state => state.preference);
  const setAppearance = useAppearance(state => state.setPreference);
  const profile = useQuery({ queryKey: ['my-profile'], queryFn: profileApi.mine });
  const interests = useQuery({ queryKey: ['interests'], queryFn: interestApi.list });
  const music = useQuery({ queryKey: ['music-preferences'], queryFn: musicApi.get });

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [name, setName] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [gender, setGender] = useState<number | null>(null);
  const [genderPreference, setGenderPreference] = useState<number | null>(null);
  const [minimumAge, setMinimumAge] = useState<string | null>(null);
  const [maximumAge, setMaximumAge] = useState<string | null>(null);

  const [selectedInterests, setSelectedInterests] = useState<string[] | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<string[] | null>(null);
  const signOut = useSession(x => x.signOut);
  const current = profile.data;

  const saveProfile = useMutation({
    mutationFn: () => {
      const date = (birthDate ?? current?.birthDate ?? '').trim();
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10))) throw new Error('Doğum tarihini YYYY-AA-GG biçiminde yaz.');
      const minText = minimumAge ?? String(current?.minimumMatchAge ?? '');
      const maxText = maximumAge ?? String(current?.maximumMatchAge ?? '');
      const min = minText.trim() ? Number(minText) : undefined;
      const max = maxText.trim() ? Number(maxText) : undefined;
      if ([min, max].some(age => age !== undefined && (!Number.isInteger(age) || age < 18 || age > 100)) || (min !== undefined && max !== undefined && min > max)) throw new Error('Yaş aralığı 18–100 arasında ve küçükten büyüğe olmalı.');
      return profileApi.update({
      displayName: name ?? current?.displayName ?? '',
      nickname: nickname ?? current?.nickname ?? '',
      bio: bio ?? current?.bio ?? '',
      city: city ?? current?.city ?? '',
      birthDate: date || undefined,
      gender: gender ?? current?.gender,
      genderPreference: genderPreference ?? current?.genderPreference,
      minimumMatchAge: min,
      maximumMatchAge: max,
    }); },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      qc.invalidateQueries({ queryKey: ['discovery'] });
      Alert.alert('Kaydedildi', 'Profil bilgilerin başarıyla güncellendi.');
    },
    onError: error => Alert.alert('Kaydedilemedi', error.message),
  });

  const updateInstantPrivacy = useMutation({
    mutationFn: (updates: Record<string, boolean>) => profileApi.updatePreferences({
      allowMessageRequests: current?.allowMessageRequests ?? true,
      allowCallsFromNonMatches: current?.allowCallsFromNonMatches ?? false,
      showOnlineStatus: current?.showOnlineStatus ?? true,
      showLastSeen: current?.showLastSeen ?? true,
      showReadReceipts: current?.showReadReceipts ?? true,
      showPremiumBadge: current?.showPremiumBadge ?? true,
      premiumPriorityOptIn: current?.premiumPriorityOptIn ?? false,
      ...updates,
    }),
    onSuccess: () => {
      Haptics.selectionAsync().catch(() => {});
      qc.invalidateQueries({ queryKey: ['my-profile'] });
    },
    onError: error => Alert.alert('Güncellenemedi', error.message),
  });

  const toggleVisibility = useMutation({
    mutationFn: () => profileApi.setVisibility(!current?.isProfileVisible),
    onSuccess: () => {
      Haptics.selectionAsync().catch(() => {});
      qc.invalidateQueries({ queryKey: ['my-profile'] });
    },
    onError: error => Alert.alert('Görünürlük değiştirilemedi', error.message),
  });

  const freeze = useMutation({
    mutationFn: accountApi.freeze,
    onSuccess: () => {
      Alert.alert('Hesap Donduruldu', 'Dilediğinde tekrar giriş yaparak hesabını aktif edebilirsin.');
      signOut();
    },
    onError: error => Alert.alert('İşlem tamamlanamadı', error.message),
  });

  const saveInterests = useMutation({
    mutationFn: () => profileApi.updateInterests(selectedInterests ?? current?.interestIds ?? []),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      Alert.alert('Kaydedildi', 'İlgi alanların güncellendi.');
    },
    onError: error => Alert.alert('Kaydedilemedi', error.message),
  });

  const saveMusic = useMutation({
    mutationFn: () => musicApi.update(selectedGenres ?? music.data ?? []),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: ['music-preferences'] });
      Alert.alert('Kaydedildi', 'Müzik zevkin güncellendi.');
    },
    onError: error => Alert.alert('Kaydedilemedi', error.message),
  });

  if (profile.isLoading) return <Screen><Loading label="Ayarlar hazırlanıyor…" /></Screen>;
  if (profile.error || !current) {
    return (
      <Screen style={styles.page}>
        <TopBar />
        <Card style={styles.errorCard}>
          <Text style={styles.cardTitle}>Ayarlar açılamadı</Text>
          <Text style={styles.muted}>{profile.error instanceof Error ? profile.error.message : 'Profil bilgilerine ulaşılamadı.'}</Text>
          <Button title="Yeniden dene" onPress={() => profile.refetch()} style={styles.topGap} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll style={styles.page}>
      <TopBar />
      <Text style={styles.eyebrow}>KONTROL PANELİN</Text>
      <Text style={styles.title}>Ayarlar</Text>
      <Text style={styles.subtitle}>MindMatch deneyimini dilediğin gibi kişiselleştir.</Text>

      {/* Segmented Control Tabs */}
      <View style={styles.tabsContainer}>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setActiveTab('profile'); }}
          style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}
        >
          <User size={15} color={activeTab === 'profile' ? colors.violet : colors.muted} />
          <Text style={[styles.tabButtonText, activeTab === 'profile' && styles.tabButtonTextActive]}>Profil</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setActiveTab('privacy'); }}
          style={[styles.tabButton, activeTab === 'privacy' && styles.tabButtonActive]}
        >
          <Shield size={15} color={activeTab === 'privacy' ? colors.violet : colors.muted} />
          <Text style={[styles.tabButtonText, activeTab === 'privacy' && styles.tabButtonTextActive]}>Gizlilik</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setActiveTab('preferences'); }}
          style={[styles.tabButton, activeTab === 'preferences' && styles.tabButtonActive]}
        >
          <Sparkles size={15} color={activeTab === 'preferences' ? colors.violet : colors.muted} />
          <Text style={[styles.tabButtonText, activeTab === 'preferences' && styles.tabButtonTextActive]}>Tercihler</Text>
        </Pressable>
      </View>

      {/* TAB 1: PROFİL */}
      {activeTab === 'profile' ? (
        <View style={styles.tabContent}>
          <Card style={styles.card}>
            <Text style={styles.cardHeading}>Temel Bilgiler</Text>
            <Text style={styles.cardSub}>Bağlantıların seni bu bilgilerle tanıyacak.</Text>

            <View style={styles.fields}>
              <Field
                label="Görünen Ad"
                value={name ?? current.displayName}
                onChangeText={setName}
                placeholder="Adın"
                maxLength={40}
              />
              <Field
                label="Kullanıcı Adı"
                value={nickname ?? current.nickname ?? ''}
                onChangeText={setNickname}
                placeholder="kullaniciadi"
                maxLength={30}
                autoCapitalize="none"
              />
              <Field
                label="Şehir"
                value={city ?? current.city ?? ''}
                onChangeText={setCity}
                placeholder="Örn. İstanbul"
                maxLength={80}
              />
              <Field
                label="Hakkımda (Biyografi)"
                value={bio ?? current.bio ?? ''}
                onChangeText={setBio}
                placeholder="Kendinden, enerjinden ve ilgi duyduğun şeylerden kısaca bahset…"
                multiline
                maxLength={300}
                style={styles.bioInput}
              />
              <Field label="Doğum tarihi" value={birthDate ?? current.birthDate ?? ''} onChangeText={setBirthDate} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12 }}>Cinsiyet</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {['Belirtme', 'Erkek', 'Kadın', 'Non-binary', 'Diğer'].map((label, value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: (gender ?? current.gender ?? 0) === value }} onPress={() => setGender(value)} style={{ paddingHorizontal: 12, minHeight: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: (gender ?? current.gender ?? 0) === value ? colors.paleViolet : colors.canvas }}><Text style={{ color: colors.ink, fontSize: 12 }}>{label}</Text></Pressable>)}
              </View>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12 }}>Tanışmak istediğin</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {['Herkes', 'Erkek', 'Kadın', 'Non-binary'].map((label, value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: (genderPreference ?? current.genderPreference ?? 0) === value }} onPress={() => setGenderPreference(value)} style={{ paddingHorizontal: 12, minHeight: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: (genderPreference ?? current.genderPreference ?? 0) === value ? colors.paleViolet : colors.canvas }}><Text style={{ color: colors.ink, fontSize: 12 }}>{label}</Text></Pressable>)}
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><Field label="En az yaş" value={minimumAge ?? String(current.minimumMatchAge ?? '')} onChangeText={setMinimumAge} keyboardType="number-pad" placeholder="18" maxLength={3} /></View>
                <View style={{ flex: 1 }}><Field label="En çok yaş" value={maximumAge ?? String(current.maximumMatchAge ?? '')} onChangeText={setMaximumAge} keyboardType="number-pad" placeholder="100" maxLength={3} /></View>
              </View>
            </View>

            <Button
              title="Değişiklikleri Kaydet"
              onPress={() => saveProfile.mutate()}
              loading={saveProfile.isPending}
              style={styles.topGap}
            />
          </Card>
        </View>
      ) : null}

      {/* TAB 2: GİZLİLİK VE GÜVENLİK */}
      {activeTab === 'privacy' ? (
        <View style={styles.tabContent}>
          {/* Keşif & Görünürlük (Anında Kayıt) */}
          <Text style={styles.sectionHeader}>Görünürlük & Durum</Text>
          <Card style={styles.card}>
            <SettingRow
              title="Keşifte Görün"
              detail="Yeni kişilerin seni keşifte bulmasına izin ver."
              value={current.isProfileVisible}
              onChange={() => toggleVisibility.mutate()}
              disabled={toggleVisibility.isPending}
            />
            <SettingRow
              title="Çevrimiçi Durumunu Göster"
              detail="Uygulamada aktif olduğun bilgisi bağlantılarına görünür."
              value={current.showOnlineStatus}
              onChange={val => updateInstantPrivacy.mutate({ showOnlineStatus: val })}
            />
            <SettingRow
              title="Son Görülmeyi Paylaş"
              detail="En son ne zaman aktif olduğun görünür."
              value={current.showLastSeen}
              onChange={val => updateInstantPrivacy.mutate({ showLastSeen: val })}
            />
          </Card>

          {/* İletişim İzinleri */}
          <Text style={styles.sectionHeader}>İletişim & Mesajlaşma</Text>
          <Card style={styles.card}>
            <SettingRow
              title="Mesaj İsteği Al"
              detail="Henüz eşleşmediğin kişiler sana mesaj isteği gönderebilsin."
              value={current.allowMessageRequests}
              onChange={val => updateInstantPrivacy.mutate({ allowMessageRequests: val })}
            />
            <SettingRow
              title="Eşleşmediğin Kişilerden Arama"
              detail="Bu izin kapalıyken yalnızca eşleştiğin kişiler arayabilir."
              value={current.allowCallsFromNonMatches}
              onChange={val => updateInstantPrivacy.mutate({ allowCallsFromNonMatches: val })}
            />
            <SettingRow
              title="Okundu Bilgisi Gönder"
              detail="Mesajları okuduğun zaman karşı tarafa çift mavi tik ile bildir."
              value={current.showReadReceipts}
              onChange={val => updateInstantPrivacy.mutate({ showReadReceipts: val })}
            />
          </Card>

          {/* Güvenlik Navigasyonları */}
          <Text style={styles.sectionHeader}>Hesap Güvenliği</Text>
          <Card style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/security')}
              style={styles.navigationRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Parola ve Oturum Güvenliği</Text>
                <Text style={styles.settingDetail}>Parolanı güncelle veya tüm cihazlardan güvenle çıkış yap.</Text>
              </View>
              <ChevronRight size={18} color={colors.violetDark} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/blocked')}
              style={styles.navigationRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Engellenen Kişiler</Text>
                <Text style={styles.settingDetail}>Daha önce engellediğin hesapları yönet.</Text>
              </View>
              <ChevronRight size={18} color={colors.violetDark} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/my-reports')} style={styles.navigationRow}>
              <View style={{ flex: 1 }}><Text style={styles.settingTitle}>Gönderdiğim Bildirimler</Text><Text style={styles.settingDetail}>İnceleme durumlarını gör.</Text></View>
              <ChevronRight size={18} color={colors.violetDark} />
            </Pressable>
          </Card>

          {/* Hesabı Dondur */}
          <Text style={styles.sectionHeader}>Hesap Durumu</Text>
          <Card style={styles.card}>
            <Text style={styles.settingTitle}>Hesabı Geçici Dondur</Text>
            <Text style={styles.settingDetail}>
              Profilin gizlenir ve keşiften kaldırılır. Yeniden giriş yaptığında tüm verilerinle geri dönersin.
            </Text>
            <Button
              title="Hesabımı Dondur"
              variant="danger"
              onPress={() => Alert.alert('Hesap Dondurulsun mu?', 'Hesabın geçici olarak devre dışı bırakılacak.', [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Dondur', style: 'destructive', onPress: () => freeze.mutate() },
              ])}
              loading={freeze.isPending}
              style={styles.topGap}
            />
          </Card>
        </View>
      ) : null}

      {/* TAB 3: TERCİHLER (İlgi Alanları & Müzik) */}
      {activeTab === 'preferences' ? (
        <View style={styles.tabContent}>
          <Text style={styles.sectionHeader}>Görünüm</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            {([['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']] as [AppearancePreference, string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: appearance === value }} onPress={() => setAppearance(value)} style={{ flex: 1, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: appearance === value ? colors.violet : colors.surface }}><Text style={{ color: appearance === value ? colors.onAccent : colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text></Pressable>)}
          </View>
          <Text style={styles.sectionHeader}>İlgi Alanların</Text>
          <Card style={styles.card}>
            <Text style={styles.cardSub}>Sana yakın frekanstaki insanları bulmamıza yardımcı olacak konuları seç.</Text>
            {interests.isLoading ? (
              <Loading label="İlgi alanları yükleniyor…" />
            ) : (
              <View style={styles.chipWrap}>
                {interests.data?.map(item => {
                  const active = (selectedInterests ?? current.interestIds ?? []).includes(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSelectedInterests(values => {
                          const next = values ?? current.interestIds ?? [];
                          return active ? next.filter(id => id !== item.id) : [...next, item.id];
                        });
                      }}
                      style={[styles.choicePill, active && styles.choicePillActive]}
                    >
                      <View style={styles.choicePillContents}>
                        {active ? <Check size={13} color={colors.violetDark} /> : null}
                        <Text style={[styles.choicePillText, active && styles.choicePillTextActive]}>{item.name}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Button
              title="İlgi Alanlarını Kaydet"
              onPress={() => saveInterests.mutate()}
              loading={saveInterests.isPending}
              style={styles.topGap}
            />
          </Card>

          <Text style={styles.sectionHeader}>Müzik Zevkin</Text>
          <Card style={styles.card}>
            <Text style={styles.cardSub}>Sevdiğin türleri seç; profillerinizde ortak müzik zevkiniz öne çıksın.</Text>
            <View style={styles.chipWrap}>
              {['Pop', 'Rock', 'Indie', 'Elektronik', 'Hip hop', 'R&B', 'Jazz', 'Klasik', 'Türkçe pop', 'Alternatif', 'Metal', 'Folk', 'Lo-Fi', 'Akustik'].map(genre => {
                const active = (selectedGenres ?? music.data ?? []).includes(genre);
                return (
                  <Pressable
                    key={genre}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelectedGenres(values => {
                        const next = values ?? music.data ?? [];
                        return active ? next.filter(value => value !== genre) : [...next, genre];
                      });
                    }}
                    style={[styles.choicePill, active && styles.choicePillActive]}
                  >
                    <View style={styles.choicePillContents}>
                      {active ? <Check size={13} color={colors.violetDark} /> : null}
                      <Text style={[styles.choicePillText, active && styles.choicePillTextActive]}>{genre}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Button
              title="Müzik Zevkini Kaydet"
              variant="soft"
              onPress={() => saveMusic.mutate()}
              loading={saveMusic.isPending}
              style={styles.topGap}
            />
          </Card>
        </View>
      ) : null}

      <View style={{ height: 40 }} />
    </Screen>
  );
}

function TopBar() {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <Pressable onPress={() => router.back()} style={styles.backBtn}>
      <ArrowLeft size={19} color={colors.ink} strokeWidth={2.2} />
    </Pressable>
  );
}

function SettingRow({
  title,
  detail,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.lilac }}
        thumbColor={value ? colors.violet : colors.white}
      />
    </View>
  );
}

const useStyles = createThemedStyles(colors => ({
  page: { paddingHorizontal: 18, paddingTop: 10 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 16,
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  eyebrow: {
    color: colors.violetDark,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: colors.ink,
    marginTop: 4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },

  // Segmented Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.line,
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  tabButtonTextActive: {
    color: colors.ink,
    fontWeight: '700',
  },

  tabContent: {
    gap: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  card: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  cardSub: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 4,
  },
  fields: {
    gap: 12,
    marginTop: 14,
  },
  bioInput: {
    height: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  topGap: {
    marginTop: 16,
  },

  // Setting Rows (Switches)
  settingRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 8,
  },
  settingCopy: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  settingDetail: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 14,
    marginTop: 3,
  },

  // Navigation Rows
  navigationRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 10,
  },

  // Choice Pills
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  choicePill: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  choicePillContents: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  choicePillActive: {
    borderColor: colors.violet,
    backgroundColor: colors.paleViolet,
  },
  choicePillText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  choicePillTextActive: {
    color: colors.violetDark,
    fontWeight: '600',
  },

  // Error Card
  errorCard: {
    padding: 20,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    color: colors.ink,
    fontWeight: '700',
  },
  muted: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 12,
    textAlign: 'center',
  },
}));
