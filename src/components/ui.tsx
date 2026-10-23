import { PropsWithChildren, ReactNode, memo, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, PressableProps, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewProps, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, freshAccessToken, onAccessTokenChanged } from '../api/client';
import { radius, space, useTheme, createThemedStyles } from '../theme/tokens';

export function Screen({ children, scroll = false, style, ...props }: PropsWithChildren<{ scroll?: boolean; style?: StyleProp<ViewStyle> } & ViewProps>) {
  const styles = useStyles();

  if (!scroll) return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, style]} {...props}>{children}</SafeAreaView>;
  const flattened = StyleSheet.flatten(style) ?? {};
  const spacingKeys = ['padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'] as const;
  const container = { ...flattened };
  const spacing: ViewStyle = {};
  for (const key of spacingKeys) {
    if (flattened[key] !== undefined) spacing[key] = flattened[key];
    delete container[key];
  }
  return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, container]} {...props}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { width: '100%', maxWidth: 640, alignSelf: 'center' }, spacing]}>{children}</ScrollView></SafeAreaView>;
}
export function BrandMark({ small = false }: { small?: boolean }) {
  const styles = useStyles();
 return <View style={[styles.mark, small && styles.markSmall]}><Text style={[styles.markText, small && styles.markTextSmall]}>m</Text><View style={styles.markDot} /></View>; }
export function Wordmark() {
  const styles = useStyles();
 return <View style={styles.wordmark}><BrandMark /><Text style={styles.wordmarkText}>mindmatch</Text></View>; }
export function Title({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  const styles = useStyles();
 return <View style={styles.titleWrap}>{right}{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>; }
export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, icon, style, ...props }: { title: string; onPress?: PressableProps['onPress']; variant?: 'primary'|'soft'|'outline'|'ghost'|'danger'; loading?: boolean; disabled?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle> } & Omit<PressableProps,'onPress'|'style'>) {
  const { colors } = useTheme();
  const styles = useStyles();

  const content = <>{loading ? <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.violet} /> : icon}{!loading && <Text style={[styles.buttonText, variant !== 'primary' && variant !== 'danger' && styles.buttonTextAlt, variant === 'danger' && styles.buttonTextDanger]}>{title}</Text>}</>;
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.button, { paddingHorizontal: 20 }, styles[`button_${variant}`], pressed && styles.pressed, (disabled || loading) && styles.disabled, style]} {...props}>{content}</Pressable>;
}
export function Field({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
 return <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.faint} style={[styles.input, style, error && styles.inputError]} selectionColor={colors.violet} {...props} />{error ? <Text style={styles.errorText}>{error}</Text> : null}</View>; }
export function Card({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const styles = useStyles();
 return <View style={[styles.card, style]} {...props}>{children}</View>; }
export function Chip({ children, tone = 'violet' }: PropsWithChildren<{ tone?: 'violet'|'green'|'coral'|'neutral' }>) {
  const { colors } = useTheme();
  const styles = useStyles();
 return <View style={[styles.chip, styles[`chip_${tone}`]]}><Text style={[styles.chipText, tone === 'green' && {color:colors.green}, tone === 'coral' && {color:colors.coral}, tone === 'neutral' && {color:colors.muted}]}>{children}</Text></View>; }
function useMediaToken(enabled: boolean) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const unsubscribe = onAccessTokenChanged(value => { if (active) setToken(value); });
    freshAccessToken().then(value => { if (active) setToken(value); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [enabled]);
  return token;
}
export const Avatar = memo(function Avatar({ name, uri, mediaAssetId, size = 50, online = false }: { name: string; uri?: string; mediaAssetId?: string; size?: number; online?: boolean }) {
  const styles = useStyles();

  const imageUri = uri || (mediaAssetId ? `${API_URL}/api/media/${mediaAssetId}` : undefined);
  const protectedMedia = Boolean(imageUri?.startsWith(`${API_URL}/`));
  const token = useMediaToken(protectedMedia);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'M';
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, overflow: 'visible' }]}>
    <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
    {imageUri && (!protectedMedia || token) ? <Image source={{ uri: imageUri, ...(protectedMedia && token ? { headers: { Authorization: `Bearer ${token}` } } : {}) }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Text style={[styles.avatarText, { fontSize: size * .31 }]}>{initials}</Text>}
    </View>
    {online && <View style={[styles.online, { width: size * .22, height: size * .22, borderRadius: size * .11, borderWidth: 2 }]} />}
  </View>;
});
export function ProtectedImage({ mediaAssetId, style, contentFit = 'cover', blurRadius = 0 }: { mediaAssetId: string; style?: StyleProp<ViewStyle>; contentFit?: 'cover' | 'contain' | 'fill'; blurRadius?: number }) {
  const { colors } = useTheme();

  const token = useMediaToken(true);
  return token ? <Image source={{ uri: `${API_URL}/api/media/${mediaAssetId}`, headers: { Authorization: `Bearer ${token}` } }} contentFit={contentFit} blurRadius={blurRadius} transition={220} style={style as any} /> : <View style={[{ backgroundColor: colors.paleViolet }, style]} />;
}
export function Empty({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  const styles = useStyles();
 return <View style={styles.empty}><View style={styles.emptyMark}>{icon}</View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text>{action}</View>; }
export function Loading({ label = 'Yükleniyor' }: {label?: string}) {
  const { colors } = useTheme();
  const styles = useStyles();
 return <View style={styles.loading}><ActivityIndicator color={colors.violetDark} /><Text style={styles.loadingText}>{label}</Text></View>; }
export function SectionLabel({ children, action }: PropsWithChildren<{action?:ReactNode}>) {
  const styles = useStyles();
 return <View style={styles.sectionLine}><Text style={styles.sectionLabel}>{children}</Text>{action}</View>; }
export function IconButton({ children, onPress, accessibilityLabel }: PropsWithChildren<{onPress?:()=>void; accessibilityLabel:string}>) {
  const styles = useStyles();
 return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({pressed})=>[styles.iconButton,pressed&&styles.pressed]}>{children}</Pressable>; }
const useStyles = createThemedStyles(colors => ({
  screen:{flex:1,backgroundColor:colors.canvas},scroll:{paddingHorizontal:20,paddingTop:12,paddingBottom:32},mark:{height:40,width:40,borderRadius:14,backgroundColor:colors.violet,alignItems:'center',justifyContent:'center',position:'relative'},markSmall:{width:28,height:28,borderRadius:10},markText:{fontSize:27,fontWeight:'700',color:colors.onAccent,marginTop:-5},markTextSmall:{fontSize:20},markDot:{position:'absolute',width:5,height:5,backgroundColor: colors.surface,borderRadius:3,right:7,top:7},wordmark:{flexDirection:'row',alignItems:'center',gap:10},wordmarkText:{color:colors.ink,fontSize:19,fontWeight:'600',letterSpacing:-.5},titleWrap:{marginBottom:20},eyebrow:{color:colors.violetDark,fontSize:10,fontWeight:'600',letterSpacing:1.7,marginBottom:9},title:{fontSize:29,lineHeight:35,fontWeight:'600',letterSpacing:-1.2,color:colors.ink},subtitle:{color:colors.muted,fontSize:14,lineHeight:21,marginTop:7},button:{height:54,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9,overflow:'hidden'},button_primary:{backgroundColor:colors.violet},button_soft:{backgroundColor:colors.paleViolet,paddingHorizontal:17},button_outline:{backgroundColor: colors.surface,borderWidth:1,borderColor:colors.line,paddingHorizontal:17},button_ghost:{paddingHorizontal:12},button_danger:{backgroundColor:colors.paleCoral,paddingHorizontal:17},buttonText:{color:colors.onAccent,fontSize:14,fontWeight:'700'},buttonTextAlt:{color:colors.violetDark},buttonTextDanger:{color:colors.red},pressed:{opacity:.82,transform:[{scale:.985}]},disabled:{opacity:.55},fieldWrap:{gap:7},fieldLabel:{fontSize:12,fontWeight:'700',color:colors.ink},input:{height:54,borderRadius:15,borderWidth:1,borderColor:colors.line,backgroundColor: colors.surface,paddingHorizontal:16,color:colors.ink,fontSize:15},inputError:{borderColor:colors.red},errorText:{color:colors.red,fontSize:11},card:{backgroundColor: colors.surface,borderRadius:radius.lg,padding:space.md},chip:{alignSelf:'flex-start',paddingHorizontal:11,paddingVertical:7,borderRadius:radius.pill,backgroundColor:colors.paleViolet},chip_violet:{backgroundColor:colors.paleViolet},chip_green:{backgroundColor:colors.paleGreen},chip_coral:{backgroundColor:colors.paleCoral},chip_neutral:{backgroundColor:colors.line},chipText:{fontSize:10,fontWeight:'700',color:colors.violetDark},avatar:{backgroundColor:colors.paleViolet,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarText:{color:colors.violetDark,fontWeight:'600'},avatarImagePlaceholder:{color:colors.violetDark,fontSize:22},online:{position:'absolute',right:0,bottom:0,backgroundColor:colors.green,borderColor: colors.surface},empty:{alignItems:'center',paddingHorizontal:27,paddingVertical:43},emptyMark:{width:66,height:66,borderRadius:22,backgroundColor:colors.paleViolet,alignItems:'center',justifyContent:'center',marginBottom:15},emptyIcon:{fontSize:25,color:colors.violetDark,fontWeight:'700'},emptyTitle:{fontSize:17,fontWeight:'600',color:colors.ink,textAlign:'center'},emptyDetail:{fontSize:13,color:colors.muted,lineHeight:20,textAlign:'center',marginTop:7},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:12},loadingText:{color:colors.muted,fontSize:13},sectionLine:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:24,marginBottom:12},sectionLabel:{fontSize:15,fontWeight:'600',color:colors.ink},iconButton:{width:43,height:43,borderRadius:15,backgroundColor: colors.surface,alignItems:'center',justifyContent:'center'}
}));

