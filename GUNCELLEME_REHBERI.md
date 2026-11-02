# 🚀 Vibe-Voice - Güncelleme Rehberi

**Son Güncelleme:** 02.11.2026  
**Mevcut Sürüm:** 2.0.1  
**Sonraki Sürüm:** 2.0.2 (veya 2.1.0, 3.0.0)

---

## 📋 Özet

Vibe-Voice artık **otomatik güncelleme** destekliyor! Kullanıcılar her güncellemede yeni `.exe` indirmek zorunda değil. Uygulama açıldığında otomatik olarak GitHub Releases'i kontrol eder ve yeni sürüm varsa kullanıcıya bildirir.

---

## 🔢 Version Numarası Kuralları (Semantic Versioning)

**Format:** `MAJOR.MINOR.PATCH` (örn: 2.0.1)

### Ne Zaman Hangisini Artırmalıyız?

**PATCH (2.0.1 → 2.0.2):**
- Küçük bug fix'leri
- Performance iyileştirmeleri
- Küçük UI düzeltmeleri
- Güvenlik yamaları

**MINOR (2.0.1 → 2.1.0):**
- Yeni özellikler eklendiğinde
- Mevcut özellikler geliştirildiğinde
- Geriye dönük uyumlu değişiklikler

**MAJOR (2.0.1 → 3.0.0):**
- Büyük mimari değişiklikler
- Geriye dönük uyumsuz değişiklikler
- Tamamen yeni sistem

---

## 📝 Adım Adım Güncelleme Süreci

### ADIM 1: `package.json`'da Version Numarasını Güncelle

```bash
cd F:\teamspeak_denemesi\frontend
```

`package.json` dosyasını aç ve `version` alanını güncelle:

```json
{
  "version": "2.0.2"  // Eski: "2.0.1"
}
```

### ADIM 2: Kod Değişikliklerini Yap

Normal geliştirme sürecini izle:
- Kod yaz/düzenle
- Test et
- QA & Security denetimi yap

### ADIM 3: Frontend Build

```bash
cd F:\teamspeak_denemesi\frontend
npm run build
```

Build başarılı olduğundan emin ol.

### ADIM 4: .EXE Üret

```bash
cd F:\teamspeak_denemesi\frontend
npm run dist
```

Bu komut:
- `dist-exe/` klasöründe yeni `.exe` üretir
- `latest.yml` dosyası oluşturur (auto-updater için gerekli)
- GitHub Releases'e upload için hazır hale getirir

**Önemli:** `dist-exe/` klasöründe şu dosyalar oluşmalı:
- `Vibe-Voice Setup 2.0.2.exe` (installer)
- `latest.yml` (version bilgisi + hash)

### ADIM 5: GitHub'a Push Et

```bash
cd F:\teamspeak_denemesi
git add .
git commit -m "v2.0.2 - Bug fixes and improvements"
git push origin main
```

### ADIM 6: GitHub Release Oluştur

**Yöntem 1: GitHub Web Arayüzü (Önerilen)**

1. https://github.com/meleksoyysal23-dot/discord_deneme/releases adresine git
2. "Draft a new release" butonuna tıkla
3. "Choose a tag" → Yeni tag oluştur: `v2.0.2`
4. Target: `main` branch
5. Release title: `Vibe-Voice v2.0.2`
6. Description: Değişiklikleri yaz (örn: "Bug fixes, performance improvements")
7. **Assets:** `dist-exe/` klasöründeki dosyaları yükle:
   - `Vibe-Voice Setup 2.0.2.exe`
   - `latest.yml`
8. "Publish release" butonuna tıkla

**Yöntem 2: GitHub CLI (gh)**

```bash
cd F:\teamspeak_denemesi\frontend\dist-exe

gh release create v2.0.2 \
  --title "Vibe-Voice v2.0.2" \
  --notes "Bug fixes and improvements" \
  "Vibe-Voice Setup 2.0.2.exe" \
  "latest.yml"
```

### ADIM 7: Otomatik Güncelleme Kontrolü

Kullanıcılar uygulamayı açtığında:
1. 3 saniye sonra otomatik güncelleme kontrolü yapılır
2. GitHub Releases'ten `latest.yml` indirilir
3. Version numarası karşılaştırılır
4. Yeni sürüm varsa → Kullanıcıya dialog gösterilir
5. Kullanıcı onaylarsa → İndirme başlar
6. İndirme tamamlandığında → Yeniden başlatma dialogu

---

## 🔍 Manuel Güncelleme Kontrolü

Kullanıcılar uygulama içindeki **"Güncellemeleri Kontrol Et"** butonunu kullanarak manuel olarak güncelleme kontrolü yapabilir.

**Nerede?**
- Lobby ekranında (hem profile hem room step)
- Room ekranında (header altında)

**Nasıl?**
1. "Kontrol Et" butonuna tıkla
2. Güncelleme durumu gösterilir:
   - 🔍 "Güncellemeler kontrol ediliyor..."
   - ✅ "En son sürümü kullanıyorsunuz" (güncelleme yoksa)
   - ✅ "Yeni sürüm mevcut: v2.0.2" (güncelleme varsa)
   - ⬇️ "İndiriliyor... XX%" (indirme sırasında)
   - ✅ "Güncelleme indirildi!" (indirme tamamlandığında)

---

## 🛠️ Sorun Giderme

### Sorun 1: Güncelleme Kontrolü Çalışmıyor

**Olası Nedenler:**
- GitHub Release doğru oluşturulmamış
- `latest.yml` dosyası eksik
- Version numarası `package.json`'da güncellenmemiş

**Çözüm:**
1. GitHub Release'i kontrol et (tag, assets)
2. `latest.yml` dosyasının yüklendiğinden emin ol
3. `package.json`'da version numarasını kontrol et

### Sorun 2: İndirme Başarısız Oluyor

**Olası Nedenler:**
- İnternet bağlantısı sorunu
- GitHub API rate limit (saatte 60 istek)
- Firewall/antivirus engeli

**Çözüm:**
1. İnternet bağlantısını kontrol et
2. Biraz bekle ve tekrar dene
3. Antivirus/firewall ayarlarını kontrol et

### Sorun 3: Güncelleme Kurulmuyor

**Olası Nedenler:**
- Uygulama açık ve dosyalar kilitli
- Admin yetkisi gerekiyor

**Çözüm:**
1. Uygulamayı kapat
2. Yeniden başlat
3. Admin olarak çalıştır (gerekirse)

---

## 📊 Güncelleme Geçmişi

### v2.0.1 (02.11.2026)
- ✅ electron-updater entegrasyonu
- ✅ Otomatik güncelleme sistemi
- ✅ UpdateStatus UI component
- ✅ GitHub Releases publish config

### v2.0.0 (02.11.2026)
- ✅ Discord/Kick hibrit arayüz
- ✅ Ses stabilitesi (ICE restart, volume control)
- ✅ Kullanıcı profilleri (cinsiyet, avatar, son görülme)
- ✅ Arkadaşlık sistemi
- ✅ Chat özellikleri (@Mention)
- ✅ Oylama sistemi
- ✅ Oda güvenliği (şifre, davet linki)

### v1.0.0 (01.11.2026)
- ✅ İlk sürüm
- ✅ WebRTC sesli iletişim
- ✅ 4 kullanıcı desteği
- ✅ Chat özelliği
- ✅ Electron masaüstü uygulaması

---

## 🎯 Önemli Notlar

1. **Version numarası her güncellemede artırılmalı** - Aksi halde auto-updater yeni sürümü algılamaz
2. **`latest.yml` dosyası zorunludur** - Auto-updater bu dosyayı kullanarak version ve hash kontrolü yapar
3. **GitHub Release tag formatı:** `v2.0.2` (başında `v` olmalı)
4. **Target branch:** `main` (veya hangi branch'te çalışıyorsan)
5. **Assets:** Hem `.exe` hem `latest.yml` yüklenmeli
6. **Test:** Release yayınladıktan sonra uygulamayı açıp güncelleme kontrolü yap

---

## 🔐 Güvenlik

- GitHub token (`GH_TOKEN`) sadece build sırasında kullanılır, koda gömülmez
- Auto-updater GitHub'ın resmi API'sini kullanır
- İndirilen dosyalar hash ile doğrulanır (latest.yml'deki SHA512)
- Kullanıcı onayı olmadan indirme/kurulum yapılmaz

---

## 📞 Destek

Sorun yaşarsan:
1. GitHub Issues: https://github.com/meleksoyysal23-dot/discord_deneme/issues
2. Bu rehberi kontrol et
3. Log dosyalarını kontrol et (Electron console)

---

**Son Güncelleme:** 02.11.2026  
**Rehber Versiyonu:** 1.0
