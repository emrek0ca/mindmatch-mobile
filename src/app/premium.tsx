import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Crown, X } from '../components/icons';
import { Pressable, Text, View } from 'react-native';
import { premiumApi } from '../api/mindmatch';
import { Button, Loading, Screen } from '../components/ui';
import { useTheme, createThemedStyles } from '../theme/tokens';

export default function PremiumScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const premium = useQuery({ queryKey: ['premium'], queryFn: premiumApi.mine });
  return <Screen scroll style={styles.page}>
    <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={() => router.back()} style={styles.close}><X size={22} color={colors.ink} /></Pressable>
    <View style={styles.hero}><View style={styles.emblem}><Crown size={42} color={colors.violetDark} /></View><Text style={styles.title}>Premium</Text></View>
    {premium.isLoading ? <Loading /> : premium.error ? <View style={styles.status}><Text style={styles.detail}>{premium.error.message}</Text><Button title="Tekrar dene" onPress={() => { void premium.refetch(); }} /></View> : <View style={styles.status}>
      <View style={styles.statusLine}><View style={[styles.dot, { backgroundColor: premium.data?.isPremium ? colors.green : colors.amber }]} /><Text style={styles.statusTitle}>{premium.data?.isPremium ? 'Üyeliğin aktif' : 'Standart üyelik'}</Text></View>
      {premium.data?.expiresAtUtc ? <Text style={styles.detail}>{new Date(premium.data.expiresAtUtc).toLocaleDateString('tr-TR')} tarihine kadar</Text> : null}
      <Button title="Üyelik tercihleri" variant="soft" onPress={() => router.push('/settings')} />
    </View>}
  </Screen>;
}
const useStyles = createThemedStyles(colors => ({
  page: { paddingHorizontal: 24, paddingTop: 12 }, close: { width: 44, height: 44, borderRadius: 22, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  hero: { alignItems: 'center', gap: 24, paddingVertical: 48 }, emblem: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.paleViolet, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.ink, fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  status: { backgroundColor: colors.surface, borderRadius: 24, padding: 24, gap: 16 }, statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dot: { width: 8, height: 8, borderRadius: 4 }, statusTitle: { color: colors.ink, fontSize: 17, fontWeight: '600' }, detail: { color: colors.muted, fontSize: 13, lineHeight: 20 },
}));
