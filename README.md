# 🎙️ Vibe-Voice

**TeamSpeak benzeri tarayıcı tabanlı sesli iletişim uygulaması**

Maksimum 4 kişinin aynı anda yüksek kaliteli sesli iletişim kurabileceği, WebRTC peer-to-peer mesh topolojisi kullanan modern bir sesli sohbet uygulaması.

## ✨ Özellikler

- 🎯 **Yüksek Ses Kalitesi**: Opus codec (48kHz mono) ile kristal netliğinde ses
- 🔗 **Peer-to-Peer Mesh**: WebRTC ile düşük latency, sunucu üzerinden geçmeyen ses trafiği
- 👥 **Maksimum 4 Kullanıcı**: Her oda için optimize edilmiş mesh topolojisi
- 🎨 **Modern UI**: Karanlık tema, gradient arka planlar, glow efektleri
- 🔊 **Konuşma Göstergesi**: Ses seviyesine göre parlayan avatarlar
- 🎤 **Mute/Deafen Kontrolleri**: Mikrofon ve kulaklık susturma
- 🔗 **Link Paylaşımı**: Tek tıkla oda linkini kopyala ve paylaş
- 🔄 **Otomatik Yeniden Bağlanma**: Bağlantı kesilirse otomatik reconnect
- 📱 **Responsive Tasarım**: Mobil ve masaüstü uyumlu

## 🏗️ Teknik Mimari

### Backend (Sinyalleşme Sunucusu)
- **Node.js** + **Express.js** + **Socket.io**
- WebRTC signaling (SDP offer/answer, ICE candidate değiş tokuşu)
- In-memory oda yönetimi (restart'ta kaybolur)
- Rate limiting ve input validation
- REST API endpoints

### Frontend (WebRTC İstemci)
- **React 19** + **Vite 8** + **Tailwind CSS 3.4**
- WebRTC peer-to-peer mesh topolojisi
- AudioContext + AnalyserNode ile ses seviyesi algılama
- Socket.io client ile signaling
- sessionStorage tabanlı anonim kullanıcı ID

### WebRTC Yapılandırması
- **Codec**: Opus (48kHz mono, yüksek kalite)
- **STUN Servers**: Google public STUN (stun.l.google.com:19302)
- **Mesh Topology**: 4 kullanıcı = 6 peer connection (4*3/2)
- **Echo Cancellation**: Aktif
- **Noise Suppression**: Aktif
- **Auto Gain Control**: Aktif

## 📦 Kurulum

### Gereksinimler
- Node.js 18+ 
- npm 9+
- Modern web tarayıcı (Chrome, Firefox, Edge, Safari)

### Backend Kurulumu

```bash
cd backend
npm install
```

### Frontend Kurulumu

```bash
cd frontend
npm install
```

## 🚀 Çalıştırma

### 1. Backend Sunucusunu Başlat

```bash
cd backend
node server.js
```

Backend `http://localhost:3001` adresinde çalışacaktır.

### 2. Frontend Geliştirme Sunucusunu Başlat

```bash
cd frontend
npm run dev
```

Frontend `http://localhost:5173` adresinde çalışacaktır.

### 3. Tarayıcıda Aç

```
http://localhost:5173
```

## 📖 Kullanım

### Oda Oluşturma
1. Ana sayfada **"Yeni Oda Oluştur"** butonuna tıkla
2. Otomatik olarak bir oda ID üretilir ve URL'e eklenir
3. Mikrofon izni iste (tarayıcı popup'ı)
4. İzin ver ve sohbete başla

### Odaya Katılma
1. Birisi sana oda linkini paylaştıysa, linke tıkla
2. Veya ana sayfada **"Oda ID ile Katıl"** alanına oda ID'sini gir
3. Mikrofon izni ver ve sohbete katıl

### Link Paylaşma
1. Odadayken **"Paylaş"** butonuna tıkla
2. Modal açılır, **"Kopyala"** butonuna tıkla
3. Link panoya kopyalanır, istediğin yerde paylaş

### Kontroller
- 🎤 **Mute**: Mikrofonunu sustur/aç
- 🎧 **Deafen**: Kulaklığını sustur/aç
- 🚪 **Ayrıl**: Odadan çık

## 🔒 Güvenlik

- **Kişisel Bilgi Yok**: Anonim kullanım, kayıt gerektirmez
- **SessionStorage**: Her sekme farklı kullanıcı ID'si
- **Input Validation**: Tüm kullanıcı girdileri doğrulanır
- **Rate Limiting**: API endpoint'leri korunur
- **CORS**: Sadece izin verilen origin'ler
- **No Hardcoded Secrets**: Tüm konfigürasyon environment variable'larda

## 🏗️ Proje Yapısı

```
vibe-voice/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── config.js          # Konfigürasyon
│   │   ├── socket/
│   │   │   ├── handlers.js        # Socket.io event handler'ları
│   │   │   └── roomManager.js     # Oda yönetimi
│   │   ├── utils/
│   │   │   └── logger.js          # Logger utility
│   │   └── constants.js           # Sabitler
│   ├── server.js                  # Ana sunucu
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Lobby.jsx          # Oda oluşturma/katılma
    │   │   ├── Room.jsx           # Ana oda ekranı
    │   │   ├── UserAvatar.jsx     # Kullanıcı avatarı
    │   │   ├── ControlBar.jsx     # Kontrol butonları
    │   │   ├── ShareModal.jsx     # Link paylaşma
    │   │   └── ConnectionStatus.jsx # Bağlantı durumu
    │   ├── hooks/
    │   │   ├── useWebRTC.js       # WebRTC hook
    │   │   ├── useSocket.js       # Socket.io hook
    │   │   └── useRoom.js         # Oda yönetimi hook
    │   ├── services/
    │   │   ├── webrtc.js          # WebRTC servisi
    │   │   └── socket.js          # Socket.io servisi
    │   ├── utils/
    │   │   └── userId.js          # Kullanıcı ID utility
    │   ├── App.jsx                # Ana uygulama
    │   ├── main.jsx               # Entry point
    │   └── index.css              # Tailwind CSS
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

## 🧪 Test Edilen Senaryolar

✅ Backend-Frontend entegrasyonu (18/18 test geçti)
✅ 4 kullanıcı eşzamanlı bağlantı
✅ WebRTC signaling (offer/answer/ice-candidate)
✅ 5. kullanıcı reddedilme (max 4 sınırı)
✅ Mesh topolojisi doğrulama
✅ Otomatik yeniden bağlanma
✅ Hata yönetimi (geçersiz input, bağlantı kesilmesi)

## 🐛 Bilinen Limitasyonlar

- **TURN Server Yok**: Sadece STUN kullanılıyor (LAN için yeterli, production'da TURN gerekli)
- **Geçici Odalar**: Sunucu restart'ta odalar kaybolur (in-memory)
- **Anonim Kullanıcı**: Kayıt/giriş sistemi yok
- **Tek Mikrofon Testi**: Gerçek ses testi 2+ mikrofon gerektirir

## 🚀 Production Deployment

### Backend
```bash
cd backend
npm install
node server.js
```

Environment variables:
```env
PORT=3001
HOST=localhost
CORS_ORIGIN=https://your-domain.com
MAX_ROOM_SIZE=4
NODE_ENV=production
```

### Frontend
```bash
cd frontend
npm install
npm run build
```

`dist/` klasörünü web sunucuna yükle (Nginx, Apache, Vercel, Netlify vb.)

### TURN Server (Production İçin Önerilir)
```javascript
// frontend/src/services/webrtc.js
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turn:your-turn-server.com:3478',
      username: 'your-username',
      credential: 'your-password'
    },
  ],
};
```

## 📝 Lisans

Bu proje eğitim amaçlı geliştirilmiştir.

## 🤝 Katkıda Bulunma

1. Fork yap
2. Feature branch oluştur (`git checkout -b feature/amazing-feature`)
3. Commit yap (`git commit -m 'Add amazing feature'`)
4. Push et (`git push origin feature/amazing-feature`)
5. Pull Request aç

## 📞 İletişim

Sorularınız için issue açabilirsiniz.

---

**Geliştirici**: Vibe-Voice Team  
**Tarih**: Kasım 2026  
**Versiyon**: 1.0.0