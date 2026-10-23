import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff } from '../components/icons';
import Animated, { cancelAnimation, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSession } from '../state/session';
import { ApiError } from '../api/client';
import { useTheme, createThemedStyles } from '../theme/tokens';
import { Button, Field } from '../components/ui';
import { MoodMascot } from '../components/MoodMascot';

const schema = z.object({ email: z.email('Geçerli bir e-posta yaz.').max(256), password: z.string().min(8, 'Parola en az 8 karakter olmalı.').max(100), displayName: z.string().max(40).optional(), nickname: z.string().max(30).optional() });
type FormValues = z.infer<typeof schema>;
export default function AuthScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const { height } = useWindowDimensions();
  const mascotMotion = useSharedValue(0);
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const user = useSession(s => s.user); const busy = useSession(s => s.busy); const error = useSession(s => s.error);
  const signIn = useSession(s => s.signIn); const reactivate = useSession(s => s.reactivate); const signUp = useSession(s => s.signUp);
  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', displayName: '', nickname: '' } });
  const mascotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(mascotMotion.value, [0, 1], [0, -8]) },
      { rotate: `${interpolate(mascotMotion.value, [0, 1], [-1.5, 1.5])}deg` },
      { scale: interpolate(mascotMotion.value, [0, 1], [1, 1.035]) },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mascotMotion.value, [0, 0.5, 1], [0.2, 0.48, 0.2]),
    transform: [{ scale: interpolate(mascotMotion.value, [0, 0.5, 1], [0.94, 1.08, 0.94]) }],
  }));
  useEffect(() => { if (user) router.replace('/(tabs)'); }, [user]);
  useEffect(() => {
    mascotMotion.value = withRepeat(withTiming(1, { duration: 1850 }), -1, true, undefined, ReduceMotion.System);
    return () => cancelAnimation(mascotMotion);
  }, [mascotMotion]);
  async function submit(values: FormValues) {
    if (busy) return;
    void Haptics.selectionAsync().catch(() => {});
    try {
      if (mode === 'register') {
        const displayName = values.displayName?.trim();
        if (!displayName) { Alert.alert('Görünen ad gerekli', 'Görünen adını yaz.'); return; }
        await signUp(values.email.trim(), values.password, displayName, values.nickname?.trim());
      } else await signIn(values.email.trim(), values.password);
    } catch (error) {
      // The session store presents request failures inline on the form.
      if (mode === 'login' && error instanceof ApiError && error.status === 401) Alert.alert('Giriş yapılamadı', 'Hesabını daha önce sen dondurduysan aynı bilgilerle yeniden etkinleştirebilirsin.', [{ text: 'Kapat', style: 'cancel' }, { text: 'Hesabımı etkinleştir', onPress: () => reactivate(values.email.trim(), values.password).catch(() => {}) }]);
    }
  }
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={[styles.hero, { paddingTop: height < 700 ? 12 : 24, paddingBottom: height < 700 ? 14 : 24 }]}>
      <Animated.View pointerEvents="none" style={[styles.mascotHalo, { width: (height < 700 ? 82 : 104) + 34, height: (height < 700 ? 82 : 104) + 34 }, haloStyle]} />
      <Animated.View style={mascotStyle}><MoodMascot mood={5} size={height < 700 ? 82 : 104} /></Animated.View>
    </View>
    <View style={styles.formCard}>
      <View style={styles.segment}><Pressable onPress={() => setMode('login')} style={[styles.segmentItem,mode==='login'&&styles.segmentActive]}><Text style={[styles.segmentText,mode==='login'&&styles.segmentTextActive]}>Giriş</Text></Pressable><Pressable onPress={() => setMode('register')} style={[styles.segmentItem,mode==='register'&&styles.segmentActive]}><Text style={[styles.segmentText,mode==='register'&&styles.segmentTextActive]}>Kayıt ol</Text></Pressable></View>
      <View style={styles.fields}>{mode==='register'&&<><Controller control={control} name="displayName" render={({field:{onChange,value}})=><Field label="Görünen ad" value={value} onChangeText={onChange} placeholder="Sana nasıl hitap edelim?" autoCapitalize="words" error={errors.displayName?.message}/>} /><Controller control={control} name="nickname" render={({field:{onChange,value}})=><Field label="Kullanıcı adı · isteğe bağlı" value={value} onChangeText={onChange} placeholder="ornek.kullanici" autoCapitalize="none" error={errors.nickname?.message}/>} /></>}
      <Controller control={control} name="email" render={({field:{onChange,value}})=><Field label="E-posta" value={value} onChangeText={onChange} placeholder="sen@ornek.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={errors.email?.message}/>} />
      <Controller control={control} name="password" render={({field:{onChange,value}})=><View><Field label="Parola" value={value} onChangeText={onChange} placeholder="En az 8 karakter" secureTextEntry={!showPassword} autoComplete={mode==='login'?'current-password':'new-password'} textContentType={mode==='login'?'password':'newPassword'} error={errors.password?.message}/><Pressable onPress={()=>setShowPassword(!showPassword)} style={styles.eye}>{showPassword?<EyeOff color={colors.muted} size={19}/>:<Eye color={colors.muted} size={19}/>}</Pressable></View>} /></View>
      {error?<Text style={styles.serverError}>{error}</Text>:null}<Button title={mode==='login'?'Giriş yap':'Hesabımı oluştur'} icon={<ArrowRight color={colors.onAccent} size={18}/>} onPress={handleSubmit(submit)} loading={busy} style={{marginTop:4}} />
      {mode==='login'?<Pressable onPress={()=>router.push('/recover')}><Text style={styles.forgot}>Parolamı unuttum</Text></Pressable>:<Text style={styles.legal}>Devam ederek kullanım koşullarını ve gizlilik politikasını kabul etmiş olursun.</Text>}
    </View>
  </ScrollView></KeyboardAvoidingView>;
}
const useStyles=createThemedStyles(colors => ({root:{flex:1,backgroundColor:colors.canvas},page:{flexGrow:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24,paddingBottom:24},hero:{width:'100%',alignItems:'center',justifyContent:'center'},mascotHalo:{position:'absolute',borderRadius:999,backgroundColor:colors.paleCoral},formCard:{width:'100%',maxWidth:440,alignSelf:'center',paddingHorizontal:0,paddingVertical:4},segment:{height:46,padding:4,backgroundColor: colors.surface,borderRadius:15,flexDirection:'row',marginBottom:20},segmentItem:{flex:1,alignItems:'center',justifyContent:'center',borderRadius:12},segmentActive:{backgroundColor:colors.paleViolet},segmentText:{color:colors.muted,fontWeight:'700',fontSize:13},segmentTextActive:{color:colors.violet},fields:{gap:13},eye:{position:'absolute',right:16,top:35},serverError:{color:colors.red,fontSize:12,lineHeight:18,marginTop:12},forgot:{color:colors.violetDark,fontWeight:'700',textAlign:'center',marginTop:18,fontSize:12},legal:{color:colors.muted,fontSize:10,lineHeight:15,textAlign:'center',marginTop:15}}));

