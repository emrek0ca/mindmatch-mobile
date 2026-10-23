import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Zap } from '../components/icons';
import { discoveryApi } from '../api/mindmatch';
import { MoodMascot, moodOption, moodOptions } from '../components/MoodMascot';
import { useTheme, createThemedStyles } from '../theme/tokens';

const energyLevels = ['Düşük', 'Orta', 'Yüksek'];
const conversationTypes = ['İç dökme', 'Tavsiye', 'Eğlence', 'Derin sohbet', 'Gündelik', 'Yeni arkadaşlık', 'Dinleme'];

export default function MoodScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const queryClient = useQueryClient();
  const latest = useQuery({ queryKey: ['my-mood'], queryFn: discoveryApi.mood, retry: false });
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [selectedEnergy, setSelectedEnergy] = useState<number | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const mood = selectedMood ?? (!latest.data?.isExpired ? latest.data?.mood : undefined) ?? 0;
  const energy = selectedEnergy ?? (!latest.data?.isExpired ? latest.data?.energy : undefined) ?? 2;
  const conversation = selectedConversation ?? (!latest.data?.isExpired ? latest.data?.desiredConversation : undefined) ?? 5;
  const save = useMutation({
    mutationFn: () => discoveryApi.checkIn(mood, energy, conversation),
    onSuccess: async value => {
      queryClient.setQueryData(['my-mood'], value);
      await queryClient.invalidateQueries({ queryKey: ['discovery'] });
      router.back();
    },
    onError: error => Alert.alert('Ruh hâli kaydedilemedi', error instanceof Error ? error.message : 'Tekrar dene.'),
  });

  return <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Geri" onPress={() => router.back()} style={styles.back}><ArrowLeft size={23} color={colors.ink} /></Pressable>
        <View style={styles.heading}><Text style={styles.title}>Ruh hâlin</Text><Text style={styles.selectedName}>{mood ? moodOption(mood).label : 'Seç'}</Text></View>
        <MoodMascot mood={mood || 9} size={70} />
      </View>
      <View style={styles.grid}>
        {moodOptions.map(option => {
          const selected = mood === option.id;
          return <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={option.label} onPress={() => setSelectedMood(option.id)} style={({ pressed }) => [styles.moodTile, selected && { backgroundColor: colors.accentSurface }, pressed && styles.pressed]}>
            <MoodMascot mood={option.id} size={64} />
            <Text numberOfLines={1} style={[styles.moodName, selected && styles.moodNameSelected]}>{option.label}</Text>
            {selected ? <View style={styles.check}><Check size={12} color={colors.onAccent} /></View> : null}
          </Pressable>;
        })}
      </View>
      <View style={styles.sectionHeading}><Zap size={17} color={colors.violetDark} /><Text style={styles.sectionTitle}>Enerji</Text></View>
      <View style={styles.energyRow}>{energyLevels.map((label, index) => {
        const selected = energy === index + 1;
        return <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedEnergy(index + 1)} style={({ pressed }) => [styles.energyOption, selected && styles.energySelected, pressed && styles.pressed]}><Text style={[styles.energyText, selected && styles.energyTextSelected]}>{label}</Text></Pressable>;
      })}</View>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Sohbet modu</Text></View>
      <View style={styles.chips}>{conversationTypes.map((label, index) => {
        const selected = conversation === index + 1;
        return <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedConversation(index + 1)} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
      })}</View>
    </ScrollView>
    <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel="Kaydet" disabled={!mood || save.isPending} onPress={() => save.mutate()} style={({ pressed }) => [styles.save, (!mood || save.isPending) && styles.saveDisabled, pressed && styles.pressed]}><Text style={styles.saveText}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</Text><ArrowRight size={20} color={colors.onAccent} /></Pressable></View>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => ({
  root: { flex: 1, backgroundColor: colors.canvas }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  header: { minHeight: 92, flexDirection: 'row', alignItems: 'center', marginBottom: 6 }, back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 5 }, heading: { flex: 1, minWidth: 0 }, title: { color: colors.ink, fontSize: 28, fontWeight: '600', letterSpacing: -0.6 }, selectedName: { color: colors.violetDark, fontSize: 13, fontWeight: '700', marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 9, rowGap: 8, marginBottom: 12 }, moodTile: { flexBasis: '30%', flexGrow: 1, minHeight: 96, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', position: 'relative' }, moodName: { color: colors.ink, fontSize: 12, fontWeight: '600', marginTop: -4 }, moodNameSelected: { fontWeight: '700', color: colors.ink }, check: { position: 'absolute', top: 7, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.violetDark, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9, marginBottom: 8 }, sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' }, energyRow: { flexDirection: 'row', gap: 8 }, energyOption: { flex: 1, minHeight: 43, backgroundColor: colors.surface, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }, energySelected: { backgroundColor: colors.violet }, energyText: { color: colors.ink, fontSize: 13, fontWeight: '700' }, energyTextSelected: { color: colors.onAccent }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, chipSelected: { backgroundColor: colors.violet }, chipText: { color: colors.ink, fontSize: 12, fontWeight: '700' }, chipTextSelected: { color: colors.onAccent }, footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 3 }, save: { minHeight: 54, paddingHorizontal: 23, borderRadius: 999, backgroundColor: colors.violet, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, saveDisabled: { opacity: .45 }, saveText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' }, pressed: { opacity: .75, transform: [{ scale: .97 }] },
}));
