# 🚀 Vibe-Voice WhatsApp Dağıtım Rehberi

**Son Güncelleme:** 02.11.2026  
**Versiyon:** 1.0.0

---

## 📋 İçindekiler
1. [Backend'i Cloud'a Yükleme](#adım-1-backend-i-cloud-a-yükleme)
2. [Frontend'i Yeniden Build Etme](#adım-2-frontend-i-yeniden-build-etme)
3. [WhatsApp'tan Paylaşım](#adım-3-whatsapp-tan-paylaşım)
4. [Sorun Giderme](#sorun-giderme)
5. [SSS](#sss)

---

## 🎯 Adım 1: Backend'i Cloud'a Yükleme

### Seçenek A: Render (Önerilen - Ücretsiz)

1. **Render Hesabı Oluştur:**
   - https://render.com adresine git
   - GitHub ile giriş yap

2. **Yeni Web Service Oluştur:**
   - "New +" → "Web Service" tıkla
   - GitHub repo'nu bağla (veya "Manual Deploy" seç)

3. **Backend Klasörünü Yükle:**
   ```bash
   # Backend klasörünü zip'le
   cd F:\teamspeak_denemesi
   tar -a -cf backend.zip backend/
   ```
   - Render'a `backend.zip`'i yükle

4. **Environment Variables Ayarla:**
   - Render dashboard'da "Environment" sekmesine git
   - Şu değişkenleri ekle:
     ```
     PORT=3001
     NODE_ENV=production
     ```

5. **Deploy Et:**
   - "Manual Deploy" → "Deploy latest commit" tıkla
   - 2-3 dakika bekle

6. **Backend URL'sini Al:**
   - Deploy tamamlandıktan sonra URL'yi kopyala
   - Örnek: `https://vibe-voice-backend.onrender.com`

### Seçenek B: Railway (Alternatif)

1. **Railway Hesabı Oluştur:**
   - https://railway.app adresine git
   - GitHub ile giriş yap

2. **Yeni Proje Oluştur:**
   - "New Project" → "Deploy from GitHub repo"
   - Backend klasörünü yükle

3. **Environment Variables Ekle:**
   - `PORT=3001`
   - `NODE_ENV=production`

4. **Deploy Et:**
   - Otomatik deploy başlayacak
   - URL'yi kopyala

---

## 🎨 Adım 2: Frontend'i Yeniden Build Etme

### 1. `.env.production` Dosyasını Güncelle

`F:\teamspeak_denemesi\frontend\.env.production` dosyasını aç:

```env
# ESKİ (placeholder)
VITE_BACKEND_URL=https://your-backend.onrender.com

# YENİ (kendi backend URL'niz)
VITE_BACKEND_URL=https://SENIN-BACKEND-URLN.onrender.com
```

**ÖNEMLİ:** `https://your-backend.onrender.com` yerine **kendi backend URL'nizi** yazın!

### 2. Yeni `.exe` Üret

```powershell
cd F:\teamspeak_denemesi\frontend
npm run dist
```

Bu komut:
- Vite build yapar (`dist/` klasörü)
- Electron ile paketler (`release/` klasörü)
- 5-10 dakika sürebilir

### 3. `.exe` Dosyasını Bul

```powershell
cd F:\teamspeak_denemesi\frontend\release
dir
```

Dosya: **`Vibe-Voice Setup 1.0.0.exe`**  
Boyut: ~116 MB

---

## 📱 Adım 3: WhatsApp'tan Paylaşım

### 1. `.exe` Dosyasını WhatsApp'tan Gönder

**Yöntem 1: Doğrudan Dosya Olarak**
- WhatsApp Desktop aç
- Arkadaşına mesaj aç
- 📎 (ataş) ikonu tıkla
- "Belge" seç
- `Vibe-Voice Setup 1.0.0.exe` dosyasını seç
- Gönder

**Yöntem 2: Cloud Storage ile**
- Google Drive / Dropbox / WeTransfer'e yükle
- Link'i WhatsApp'tan paylaş

### 2. Arkadaşlarına Kurulum Talimatı Gönder

```
🎤 Vibe-Voice Kurulum Rehberi

1️⃣ "Vibe-Voice Setup 1.0.0.exe" dosyasını indir
2️⃣ Çift tıkla, kurulumu başlat
3️⃣ "Next" → "Install" → "Finish"
4️⃣ Masaüstünde "Vibe-Voice" kısayolu oluşur
5️⃣ Uygulamayı aç
6️⃣ Mikrofon izni ver (ilk açılışta sorar)
7️⃣ Oda oluştur veya odaya katıl
8️⃣ Link'i arkadaşlarınla paylaş

🔗 Oda Linki: [Backend URL'ni buraya yaz]

Sorun yaşarsan bana yaz! 🚀
```

### 3. İlk Kullanım

**Oda Oluşturma:**
1. Uygulamayı aç
2. "Yeni Oda Oluştur" butonuna tıkla
3. Kullanıcı adını gir
4. "Oda Oluştur" tıkla
5. Link'i kopyala, arkadaşlarına gönder

**Odaya Katılma:**
1. Arkadaşından gelen linke tıkla
2. Uygulama otomatik açılır
3. Kullanıcı adını gir
4. "Odaya Katıl" tıkla
5. Sesli sohbet başlar!

---

## 🔧 Sorun Giderme

### Problem: "Backend'e bağlanılamıyor"

**Çözüm:**
1. Backend URL'nin doğru olduğundan emin ol
2. Backend'in çalıştığından emin ol (Render dashboard'da kontrol et)
3. `.env.production` dosyasını güncellediğinden emin ol
4. Frontend'i yeniden build et (`npm run dist`)

### Problem: "Mikrofon çalışmıyor"

**Çözüm:**
1. Windows ses ayarlarını kontrol et
2. Mikrofon izinlerini kontrol et (Windows Ayarları → Gizlilik → Mikrofon)
3. Uygulamayı yönetici olarak çalıştır
4. Farklı bir mikrofon dene

### Problem: "Ses gelmiyor"

**Çözüm:**
1. Hoparlör/kulaklık bağlantısını kontrol et
2. Windows ses seviyesini kontrol et
3. Uygulama içinde ses seviyesini kontrol et (🔊 ikonu)
4. WebRTC bağlantısını kontrol et (Connection Status)

### Problem: ".exe açılmıyor"

**Çözüm:**
1. Windows Defender'u geçici olarak devre dışı bırak
2. Dosyaya sağ tıkla → "Yönetici olarak çalıştır"
3. Farklı bir klasöre kur
4. Antivirus istisnalarına ekle

---

## ❓ SSS (Sıkça Sorulan Sorular)

**S: Backend ücretsiz mi?**  
C: Evet, Render ücretsiz planda ayda 750 saat ücretsiz. 4 kişi için yeterli.

**S: .exe dosyası güvenli mi?**  
C: Evet, açık kaynak kodlu, virüs taramasından geçti. Windows Defender uyarı verirse "Yine de çalıştır" de.

**S: Mobil versiyon var mı?**  
C: Şu an sadece Windows. Mobil versiyon gelecek.

**S: Ekran paylaşımı yapabilir miyim?**  
C: Şu an yok, gelecek güncellemelerde eklenecek.

**S: Kaç kişi aynı anda konuşabilir?**  
C: 4 kişi aynı anda konuşabilir (WebRTC mesh topology).

**S: Ses kalitesi nasıl?**  
C: Opus codec ile 48kHz mono, yüksek kalite.

**S: İnternet hızı ne olmalı?**  
C: Minimum 1 Mbps upload/download (4 kişi için 2-3 Mbps önerilir).

---

## 📞 İletişim

Sorun yaşarsan:
- WhatsApp: [Numaranı buraya yaz]
- Email: [Email adresini buraya yaz]
- GitHub Issues: [Repo URL'n]

---

## 🎉 Başarılar!

Vibe-Voice ile kaliteli sesli sohbetlerin tadını çıkar! 🚀🎤

**Son Güncelleme:** 02.11.2026  
**Versiyon:** 1.0.0
