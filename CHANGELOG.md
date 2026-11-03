# Changelog

Tüm önemli değişiklikler bu dosyada belgelenecektir.

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) temel alınmıştır ve bu proje [Anlamlı Sürümleme](https://semver.org/lang/tr/) kurallarına uyar.

## [2.1.1] - 2026-11-03

### Added
- Profil oluşturma ve düzenleme özelliği (20 emoji avatar picker)
- Settings modalına "Profil Düzenleme" sekmesi eklendi
- Backend PUT /api/auth/me endpoint (profil güncelleme)

### Fixed
- Kanal listesi görünürlük hatası düzeltildi (React reactivity - workspace.js getChannels() array kopyası)
- Tema gradient tüm uygulamayı kapsayacak şekilde düzeltildi (DiscordLayout root div)
- Sesli sohbet bağlantı sorunu giderildi (LiveKit token endpoint + credentials)

### Security
- Backend PUT /api/auth/me endpoint auth middleware ile korundu
- Input validation eklendi (displayName max 32 karakter, avatar max 500 karakter)
- Mass assignment koruması sağlandı (sadece izin verilen alanlar güncellenebilir)

### Changed
- Profil yönetimi için dedicated component (ProfileSetup.jsx)
- Avatar seçimi için emoji tabanlı picker UI

## [2.1.0] - 2026-11-03

### Added
- FAZ 19: Kapsamlı özellik seti ve iyileştirmeler
- Gelişmiş kullanıcı arayüzü bileşenleri
- Performans optimizasyonları

## [2.0.1] - 2026-11-02

### Added
- Auto-Updater sistemi
- UpdateStatus UI bileşeni

### Fixed
- 0.0.0.0 binding sorunu
- CORS wildcard yapılandırması (Render/Electron uyumluluğu)

## [2.0.0] - 2026-11-01

### Added
- İlk kararlı sürüm
- WebRTC tabanlı sesli sohbet
- Socket.io signaling server
- Electron masaüstü uygulaması
- Otomatik güncelleme desteği