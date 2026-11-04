/**
 * API Client
 * Backend REST çağrıları için token-aware fetch helper.
 * Token sessionStorage/localStorage'dan okunur; yoksa çağrılar sessizce
 * null döndürür (caller fallback kullanır).
 */

// Backend URL — Environment variable veya fallback
// Production build'de .env.production okunur, development'te .env.development
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://discord-deneme-klyz.onrender.com';

// Yaygın token anahtarları — auth UI henüz eklenmediği için birkaç
// olası anahtarı deneriz. Hiçbiri yoksa istek gönderilmez.
const TOKEN_KEYS = [
  'voicecan-token', // Birincil anahtar
  'vibe-voice-token',
  'vibe-voice-auth-token',
  'token',
  'authToken',
  'auth-token',
  'accessToken',
];

/**
 * Mevcut JWT token'ını sessionStorage/localStorage'dan oku.
 * @returns {string|null}
 */
export function getAuthToken() {
  const storages = [sessionStorage, localStorage];
  for (const storage of storages) {
    for (const key of TOKEN_KEYS) {
      try {
        const value = storage.getItem(key);
        if (value) return value;
      } catch {
        // Bazı ortamlarda storage erişimi kısıtlı olabilir; yut.
      }
    }
  }
  return null;
}

/**
 * 401 Unauthorized alındığında tüm olası token anahtarlarını temizle
 * ve uygulamayı login ekranına yönlendir (reload).
 * Merkezi handler — apiFetch ve fetchMe tarafından kullanılır.
 */
function handleUnauthorized() {
  const storages = [sessionStorage, localStorage];
  for (const storage of storages) {
    for (const key of TOKEN_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // Storage erişimi kısıtlı olabilir; yut.
      }
    }
  }
  // Login ekranına yönlendir
  window.location.reload();
}

/**
 * Kimliği doğrulanmış JSON fetch.
 * Token yoksa çağrı yapılmaz, null döner.
 * @param {string} path - /api/... yolu
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<object|null>}
 */
async function apiFetch(path, { signal } = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BACKEND_URL}${path}`, { headers, signal });

  const data = await res.json().catch(() => null);

  // 401 Unauthorized → token geçersiz/süresi dolmuş, otomatik logout
  if (res.status === 401) {
    handleUnauthorized();
    return; // reload sonrası bu satıra ulaşılmaz
  }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (data && data.success === false) {
    const err = new Error(data.error || 'API error');
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Kullanıcının üye olduğu sunucuları listele.
 * Token yoksa null döner (caller fallback kullanır).
 * @returns {Promise<Array|null>}
 */
export async function fetchServers({ signal } = {}) {
  if (!getAuthToken()) return null;
  const data = await apiFetch('/api/servers', { signal });
  return Array.isArray(data?.servers) ? data.servers : [];
}

/**
 * Sunucu detaylarını (kanallar + üyeler) çek.
 * Not: Backend'de /api/servers/:id/channels yoktur;
 * GET /api/servers/:id yanıtında `channels` dizisi gelir.
 * @param {string} serverId
 * @returns {Promise<object|null>}
 */
export async function fetchServerDetail(serverId, { signal } = {}) {
  if (!serverId) return null;
  if (!getAuthToken()) return null;
  const data = await apiFetch(`/api/servers/${encodeURIComponent(serverId)}`, { signal });
  return data?.server || null;
}

/**
 * Kullanıcı kaydı
 * @param {{ username: string, password: string, displayName?: string }} credentials
 * @returns {Promise<{ success: boolean, user: object, token: string }>}
 */
export async function register(credentials) {
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Registration failed');
  }
  return data;
}

/**
 * Kullanıcı girişi
 * @param {{ username: string, password: string }} credentials
 * @returns {Promise<{ success: boolean, user: object, token: string }>}
 */
export async function login(credentials) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch (fetchError) {
    // Ağ hatası, CORS hatası, sunucuya ulaşılamıyor vb.
    throw new Error(`Ağ hatası: ${fetchError.message || 'Sunucuya bağlanılamadı'}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (parseError) {
    // Response JSON değil
    throw new Error(`Sunucu yanıtı geçersiz (HTTP ${res.status}): ${await res.text().catch(() => 'Okunamadı')}`);
  }

  if (!res.ok || data.success === false) {
    // Detaylı hata mesajı oluştur
    const errorMessage = data.error || data.message || 'Login failed';
    const statusCode = res.status;

    // HTTP status'e göre daha açıklayıcı mesaj
    let detailedMessage = errorMessage;
    if (statusCode === 500) {
      detailedMessage = `Sunucu hatası (500): ${errorMessage}`;
    } else if (statusCode === 503) {
      detailedMessage = `Sunucu şu anda kullanılamıyor (503): ${errorMessage}`;
    } else if (statusCode === 400) {
      detailedMessage = `Geçersiz istek (400): ${errorMessage}`;
    } else if (statusCode === 401 || statusCode === 403) {
      detailedMessage = `Yetkilendirme hatası (${statusCode}): ${errorMessage}`;
    }

    const error = new Error(detailedMessage);
    error.status = statusCode;
    error.responseData = data;
    throw error;
  }
  return data;
}

/**
 * Mevcut kullanıcı bilgisi (JWT required)
 * @returns {Promise<{ success: boolean, user: object }>}
 */
export async function fetchMe() {
  const token = getAuthToken();
  if (!token) throw new Error('No token');
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Failed to fetch user');
  }
  return data;
}

/**
 * Super Admin yetkisi kazan (Kurucu Kodu)
 * @param {string} code
 * @returns {Promise<{ success: boolean, superAdmin: boolean }>}
 */
export async function elevate(code) {
  const token = getAuthToken();
  if (!token) throw new Error('No token');
  const res = await fetch(`${BACKEND_URL}/api/auth/elevate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Elevation failed');
  }
  return data;
}

/**
 * Kullanıcı profilini güncelle (displayName, avatar)
 * @param {{ displayName?: string, avatar?: string }} profileData
 * @returns {Promise<{ success: boolean, user: object }>}
 */
export async function updateProfile({ displayName, avatar }) {
  const token = getAuthToken();
  if (!token) throw new Error('No token');
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName, avatar }),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Profil güncelleme başarısız');
  }
  return data;
}

/**
 * Davet bilgisi al (modal'da sunucu bilgisi gösterimi için)
 * @param {string} code - Davet kodu
 * @returns {Promise<object>} Davet bilgisi (server, code, isAlreadyMember, vb.)
 */
export async function fetchInviteInfo(code) {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token');

  const res = await fetch(`${BACKEND_URL}/api/invites/${encodeURIComponent(code)}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'Davet bilgisi alınamadı');
  }
  return data.invite;
}

/**
 * Davet ile sunucuya katıl
 * @param {string} code - Davet kodu
 * @returns {Promise<object>} Katılma sonucu (server objesi içerir)
 */
export async function joinServerViaInvite(code) {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token');

  const res = await fetch(`${BACKEND_URL}/api/invites/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'Sunucuya katılamadı');
  }
  return data;
}

/**
 * Sunucu için davet kodu oluştur
 * @param {string} serverId - Sunucu ID'si
 * @param {{ maxAge?: number, maxUses?: number }} options - Davet seçenekleri
 * @returns {Promise<object>} Davet bilgisi (code, expiresAt, vb.)
 */
export async function createInvite(serverId, options = {}) {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token');

  const res = await fetch(`${BACKEND_URL}/api/servers/${encodeURIComponent(serverId)}/invites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      maxAge: options.maxAge || 86400, // 24 saat
      maxUses: options.maxUses || 100,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'Davet oluşturulamadı');
  }
  return data.invite;
}
