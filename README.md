# MindMatch Mobile

React Native / Expo Router istemcisi. API adresi `EXPO_PUBLIC_API_URL` ile belirlenir; oturum belirteçleri `expo-secure-store` içinde saklanır.

## Telefonda açma

1. `mobile` klasöründe `.env.example` dosyasını `.env.local` olarak kopyala ve `EXPO_PUBLIC_API_URL` değerini herkese açık, HTTPS kullanan API adresiyle doldur.
2. TestFlight için EAS build profiline aynı `EXPO_PUBLIC_API_URL` değerini ekle; bu değer uygulama derlenirken pakete gömülür.
3. `npm install` ve `npm run start:tunnel` komutları geliştirme sırasında Metro üzerinden güncel JS'i sunar; yayınlanan TestFlight uygulamasında Metro gerekmez.
4. Native WebRTC eklentisi, kamera/mikrofon izin metinleri veya iOS ayarları değiştiğinde yeni iOS build alıp TestFlight'a yükle. OTA güncellemesi native modülü sonradan ekleyemez.

Expo'nun ngrok bağlantısı `remote gone away` hatası verirse, Cloudflare `cloudflared` kurulu makinede şu yedek yöntemi kullan: ilk terminalde `cloudflared tunnel --url http://127.0.0.1:80 --no-autoupdate` çalıştır; çıkan `https://<host>.trycloudflare.com` adresinin yalnızca host kısmını `.env.local` içindeki `REACT_NATIVE_PACKAGER_HOSTNAME` olarak ayarla. İkinci terminalde `npx expo start --port 80 --lan` çalıştır. Bu yöntem Metro ve görsel dosyalarını aynı herkese açık HTTP portundan geçirir. Quick Tunnel adresi geçicidir; tunnel yeniden açıldığında host değerini güncelle.

Sesli ve görüntülü arama için TestFlight uygulaması `react-native-webrtc` native modülü içeren bir build olmalıdır. Medyanın gerçek cihazlar ve ağlar arasında geçmesi için API yanında TURN sunucusu da zorunludur. TURN sunucusu ve API ayarları için üst dizindeki `turn/README.md` yönergesini izleyin. İki cihazı farklı ağlarda (ör. Wi-Fi ve hücresel) deneyin.

## Komutlar

- `npm start` — LAN/varsayılan Expo sunucusu.
- `npm run start:tunnel` — uzaktan telefon bağlantısı için Expo tunnel.
- `npx expo lint` — ESLint.
- `npx tsc --noEmit` — TypeScript kontrolü.

API kapsamı ve backend'de olmayan işlevler için [API_INVENTORY.md](./API_INVENTORY.md) dosyasına bak.
