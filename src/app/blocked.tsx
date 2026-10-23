import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowLeft, Check } from '../components/icons';
import { blockApi, profileApi } from '../api/mindmatch';
import { Avatar, Button, Card, Empty, Loading, Screen, Title } from '../components/ui';
import { useTheme, createThemedStyles } from '../theme/tokens';

export default function BlockedScreen() {
  const { colors } = useTheme();
  const styles = useStyles();

  const qc=useQueryClient(); const blocks=useQuery({queryKey:['blocks'],queryFn:blockApi.list});
  const people=useQueries({queries:(blocks.data??[]).map(id=>({queryKey:['profile',id],queryFn:()=>profileApi.get(id),retry:false}))});
  const unblock=useMutation({mutationFn:blockApi.unblock,onSuccess:()=>qc.invalidateQueries({queryKey:['blocks']}),onError:error=>Alert.alert('Engel kaldırılamadı',error.message)});
  if(blocks.isLoading)return <Screen><Loading label="Engellenenler yükleniyor"/></Screen>;
  return <Screen style={styles.page}><Pressable onPress={()=>router.back()} style={styles.back}><ArrowLeft size={19} color={colors.ink}/></Pressable><Title eyebrow="GİZLİLİK" title="Engellenen kişiler" subtitle="Engellediğin kişileri buradan tekrar erişilebilir yapabilirsin."/>
  <FlatList data={blocks.data??[]} keyExtractor={id=>id} contentContainerStyle={{paddingBottom:30,flexGrow:1}} renderItem={({item,index})=>{const person=people[index]?.data;return <Card style={styles.row}><Pressable onPress={()=>router.push({pathname:'/user/[id]',params:{id:item}})}><Avatar name={person?.displayName??'MindMatch'} size={48}/></Pressable><View style={{flex:1}}><Text style={styles.name}>{person?.displayName??'MindMatch kullanıcısı'}</Text><Text style={styles.detail}>{person?.nickname?`@${person.nickname}`:'Profil bilgileri kullanılamıyor'}</Text></View><Button title="Engeli kaldır" variant="outline" loading={unblock.isPending&&unblock.variables===item} onPress={()=>Alert.alert('Engel kaldırılsın mı?','Bu kişi yeniden profilini görebilir ve izinlerine göre sana ulaşabilir.',[{text:'Vazgeç',style:'cancel'},{text:'Kaldır',onPress:()=>unblock.mutate(item)}])} style={styles.button}/></Card>}} ListEmptyComponent={<Card><Empty icon={<Check size={24} color={colors.violetDark} />} title="Engellenen kişi yok" detail="Engellediğin kişiler burada görünür."/></Card>}/></Screen>;
}
const useStyles=createThemedStyles(colors => ({page:{paddingHorizontal:22,paddingTop:12},back:{width:40,height:40,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor: colors.surface,borderWidth:1,borderColor:colors.line,marginBottom:20},row:{flexDirection:'row',alignItems:'center',gap:11,padding:13,marginBottom:9},name:{fontSize:12,color:colors.ink,fontWeight:'700'},detail:{fontSize:10,color:colors.muted,marginTop:4},button:{height:40,paddingHorizontal:10}}));
