import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowLeft, KeyRound, LogOut, UsersRound } from '../components/icons';
import { authApi } from '../api/mindmatch';
import { Button, Card, Field, Screen, Title } from '../components/ui';
import { useSession } from '../state/session';
import { useTheme, createThemedStyles } from '../theme/tokens';

export default function SecurityScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const signOut = useSession(s => s.signOut);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const change = useMutation({ mutationFn: () => authApi.changePassword(currentPassword, newPassword), onSuccess: () => { setCurrentPassword(''); setNewPassword(''); Alert.alert('Parola güncellendi', 'Diğer cihazlardaki oturumlarını da kapatmayı düşünebilirsin.'); }, onError: error => Alert.alert('Parola güncellenemedi', error.message) });
  const signOutEverywhere = useMutation({ mutationFn: authApi.logoutAll, onSuccess: async () => { await signOut(); router.replace('/'); }, onError: error => Alert.alert('Oturumlar kapatılamadı', error.message) });
  return <Screen scroll style={styles.page}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={19} color={colors.ink}/></Pressable><Title eyebrow="HESAP GÜVENLİĞİ" title="Güvenlik" subtitle="Parolanı ve açık oturumlarını yönet."/>
    <Card style={styles.card}><KeyRound size={19} color={colors.violetDark}/><Text style={styles.heading}>Parolanı değiştir</Text><Text style={styles.copy}>Mevcut parolanı doğrulayarak yeni bir parola belirle.</Text><Field label="Mevcut parola" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" textContentType="password"/><Field label="Yeni parola" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword"/><Button title="Parolayı güncelle" loading={change.isPending} disabled={!currentPassword || newPassword.length < 8} onPress={() => change.mutate()} style={styles.action}/></Card>
    <Card style={styles.card}><UsersRound size={19} color={colors.violetDark}/><Text style={styles.heading}>Tüm cihazlardan çık</Text><Text style={styles.copy}>Bu işlem tüm aktif yenileme oturumlarını geçersiz kılar. Bu cihazdan da çıkış yapılır.</Text><Button title="Tüm oturumları kapat" variant="danger" icon={<LogOut size={17} color={colors.red}/>} loading={signOutEverywhere.isPending} onPress={() => Alert.alert('Tüm oturumlar kapatılsın mı?', 'Tekrar giriş yapman gerekecek.', [{ text:'Vazgeç', style:'cancel' }, { text:'Kapat', style:'destructive', onPress:() => signOutEverywhere.mutate() }])} style={styles.action}/></Card>
    <Pressable onPress={() => router.push('/recover')}><Text style={styles.forgot}>Mevcut parolanı bilmiyor musun? Sıfırlama bağlantısı iste.</Text></Pressable>
  </Screen>;
}
const useStyles=createThemedStyles(colors => ({page:{paddingHorizontal:22,paddingTop:12},back:{width:40,height:40,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor: colors.surface,borderWidth:1,borderColor:colors.line,marginBottom:20},card:{padding:17,marginBottom:13},heading:{fontSize:14,fontWeight:'700',color:colors.ink,marginTop:11},copy:{fontSize:11,lineHeight:16,color:colors.muted,marginTop:5,marginBottom:14},action:{marginTop:14},forgot:{color:colors.violetDark,fontSize:11,fontWeight:'600',textAlign:'center',paddingVertical:14}}));
