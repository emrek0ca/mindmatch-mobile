import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck } from '../components/icons';
import { reportApi } from '../api/mindmatch';
import { Empty, Loading, Screen } from '../components/ui';
import { useTheme, createThemedStyles } from '../theme/tokens';

const statusNames: Record<number, string> = { 1: 'Alındı', 2: 'İnceleniyor', 3: 'Sonuçlandı', 4: 'Kapatıldı' };
const reasonNames: Record<number, string> = { 1: 'Taciz', 2: 'Hakaret', 3: 'Uygunsuz içerik', 4: 'Spam', 5: 'Sahte profil', 6: 'Tehdit', 7: 'Uygunsuz medya', 8: 'Diğer' };

export default function MyReportsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const reports = useQuery({ queryKey: ['my-reports'], queryFn: reportApi.mine });
  return <Screen scroll style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="Geri" onPress={() => router.back()} style={styles.back}><ArrowLeft size={20} color={colors.ink} /></Pressable><Text style={styles.title}>Şikâyetlerim</Text></View>
    {reports.isLoading ? <Loading label="Kayıtlar yükleniyor" /> : reports.isError ? <Empty icon={<ShieldCheck size={24} color={colors.violetDark} />} title="Kayıtlar açılamadı" detail="Bağlantını kontrol edip yeniden dene." action={<Pressable onPress={() => reports.refetch()}><Text style={styles.retry}>Yeniden dene</Text></Pressable>} /> : reports.data?.length ? reports.data.map(report => <View key={report.id} style={styles.row}><View style={styles.icon}><ShieldCheck size={20} color={colors.violetDark} /></View><View style={styles.copy}><Text style={styles.reason}>{reasonNames[report.reason] ?? 'Bildirim'}</Text><Text style={styles.date}>{new Date(report.createdAtUtc).toLocaleDateString('tr-TR')}</Text></View><Text style={styles.status}>{statusNames[report.status] ?? 'İşlemde'}</Text></View>) : <Empty icon={<ShieldCheck size={24} color={colors.violetDark} />} title="Henüz kayıt yok" detail="Gönderdiğin kullanıcı bildirimleri burada görünür." />}
  </Screen>;
}

const useStyles = createThemedStyles(colors => ({
  screen: { paddingHorizontal: 20, paddingTop: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }, back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.ink, fontSize: 23, fontWeight: '600' }, row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, icon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.paleViolet, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, reason: { color: colors.ink, fontSize: 14, fontWeight: '700' }, date: { color: colors.muted, fontSize: 11, marginTop: 4 }, status: { color: colors.violetDark, fontSize: 11, fontWeight: '600' }, retry: { color: colors.violetDark, fontWeight: '600' },
}));
