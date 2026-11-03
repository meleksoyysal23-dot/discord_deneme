/**
 * Workspace Utility
 * Yerel sunucu/kanal yönetimi - localStorage'da kalıcı saklama.
 * Tüm mutasyonlar modül içindeki güncel workspace referansı üzerinde çalışır
 * ve anında persist edilir. App bu referansı state olarak tutar.
 */

const WORKSPACE_KEY = 'vibe-voice-workspace';
const OWNER_KEY = 'vibe-voice-owner-id';

// Modül içi güncel workspace referansı (loadWorkspace ile doldurulur)
let current = null;

/**
 * Kalıcı yerel sahip kimliği.
 * localUserId sessionStorage'da (sekme başına) tutulduğu için sunucu sahipliği
 * ona bağlanamaz; aksi halde uygulama yeniden açıldığında kullanıcı kendi
 * sunucusunun sahibi olmaktan çıkar ve kanal yönetimi kaybolur.
 * @returns {string}
 */
export function getOwnerId() {
  try {
    let id = localStorage.getItem(OWNER_KEY);
    if (!id) {
      id =
        'owner-' +
        Math.random().toString(36).substring(2, 10) +
        Date.now().toString(36);
      localStorage.setItem(OWNER_KEY, id);
    }
    return id;
  } catch {
    return 'owner-local';
  }
}

function generateId() {
  return 'id-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function defaultWorkspace(localUserId) {
  const serverId = generateId();
  return {
    servers: [{ id: serverId, name: 'Sunucum', ownerId: localUserId, icon: null }],
    channelsByServer: {
      [serverId]: [
        { id: generateId(), name: 'genel', type: 'TEXT', position: 0 },
        { id: generateId(), name: 'Genel Ses', type: 'VOICE', position: 1 },
      ],
    },
    activeServerId: serverId,
  };
}

function persist() {
  if (!current) return;
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn('Workspace persist failed:', e);
  }
}

/**
 * Workspace'i localStorage'dan yükle veya varsayılan oluştur.
 * Eski kayıtlardaki ownerId, yeni kalıcı ownerId'ye migrate edilir; böylece
 * uygulama yeniden açıldığında kullanıcı kendi varsayılan sunucusunun sahibi
 * olmaya devam eder.
 *
 * @param {object} profile - Kullanıcı profili (kullanılmıyor, imza uyumu için)
 * @param {string} localUserId - Yerel kullanıcı ID (fallback)
 * @param {string} [ownerId] - Kalıcı sahip ID; verilmezse getOwnerId() kullanılır
 * @returns {object} Workspace objesi
 */
export function loadWorkspace(profile, localUserId, ownerId) {
  const owner = ownerId || getOwnerId();
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        Array.isArray(parsed.servers) &&
        parsed.servers.length > 0 &&
        parsed.channelsByServer &&
        typeof parsed.channelsByServer === 'object'
      ) {
        current = parsed;
        // Eksik alanları tamamla
        if (!current.activeServerId || !current.servers.some((s) => s.id === current.activeServerId)) {
          current.activeServerId = current.servers[0].id;
        }
        // Eski kayıtlarda ownerId session-scoped localUserId idi; migrate et
        if (!current.servers.some((s) => s.ownerId === owner)) {
          current.servers[0].ownerId = owner;
          persist();
        }
        return current;
      }
    }
  } catch (e) {
    console.warn('Workspace load failed:', e);
  }

  current = defaultWorkspace(owner);
  persist();
  return current;
}

/**
 * Workspace'i açıkça kaydet (normalde gerekmez, mutasyonlar otomatik kaydeder)
 * @param {object} [ws] - Kaydedilecek workspace; verilmezse modül referansı
 */
export function saveWorkspace(ws) {
  if (ws) current = ws;
  persist();
}

/**
 * Yeni kanal oluştur
 * @param {string} serverId - Sunucu ID
 * @param {{name: string, type: 'TEXT'|'VOICE'}} channelData
 * @returns {object} Güncellenmiş workspace (aynı referans)
 */
export function createChannel(serverId, { name, type }) {
  if (!current || !serverId) return current;
  const server = current.servers.find((s) => s.id === serverId);
  // Yetkisiz: sunucu yoksa veya sahibi değilse değişiklik yapma
  if (!server || server.ownerId !== getOwnerId()) return current;
  if (!current.channelsByServer[serverId]) current.channelsByServer[serverId] = [];

  const channels = current.channelsByServer[serverId];
  const maxPos = channels.reduce((m, c) => Math.max(m, c.position || 0), -1);
  channels.push({
    id: generateId(),
    name: (name || '').trim().substring(0, 40) || 'yeni-kanal',
    type: type === 'VOICE' ? 'VOICE' : 'TEXT',
    position: maxPos + 1,
  });

  persist();
  return current;
}

/**
 * Kanal sil
 * @param {string} serverId - Sunucu ID
 * @param {string} channelId - Kanal ID
 * @returns {object} Güncellenmiş workspace (aynı referans)
 */
export function deleteChannel(serverId, channelId) {
  if (!current || !serverId || !current.channelsByServer[serverId]) return current;
  const server = current.servers.find((s) => s.id === serverId);
  // Yetkisiz: sunucu yoksa veya sahibi değilse değişiklik yapma
  if (!server || server.ownerId !== getOwnerId()) return current;

  current.channelsByServer[serverId] = current.channelsByServer[serverId].filter(
    (c) => c.id !== channelId
  );
  persist();
  return current;
}

/**
 * Yeni sunucu oluştur
 * @param {string} name - Sunucu adı
 * @param {string} ownerId - Sahip kullanıcı ID
 * @returns {object} Güncellenmiş workspace (aynı referans)
 */
export function createServer(name, ownerId) {
  if (!current) return current;

  // Kullanıcı yalnızca kendi adına sunucu açabilir; parametre yok sayılır.
  // (ownerId imzada geriye uyumluluk için duruyor.)
  const owner = getOwnerId();
  const id = generateId();
  current.servers.push({
    id,
    name: (name || '').trim().substring(0, 40) || 'Yeni Sunucu',
    ownerId: owner,
    icon: null,
  });
  current.channelsByServer[id] = [
    { id: generateId(), name: 'genel', type: 'TEXT', position: 0 },
    { id: generateId(), name: 'Genel Ses', type: 'VOICE', position: 1 },
  ];
  current.activeServerId = id;

  persist();
  return current;
}

/**
 * Sunucu adını değiştir
 * @param {string} serverId - Sunucu ID
 * @param {string} name - Yeni ad
 * @returns {object} Güncellenmiş workspace (aynı referans)
 */
export function renameServer(serverId, name) {
  if (!current) return current;
  const server = current.servers.find((s) => s.id === serverId);
  // Yetkisiz: sunucu yoksa veya sahibi değilse değişiklik yapma
  if (!server || server.ownerId !== getOwnerId()) return current;

  current.servers = current.servers.map((s) =>
    s.id === serverId
      ? { ...s, name: (name || '').trim().substring(0, 40) || s.name }
      : s
  );
  persist();
  return current;
}

/**
 * Aktif sunucuyu değiştir
 * @param {string} serverId
 * @returns {object} Güncellenmiş workspace (aynı referans)
 */
export function setActiveServer(serverId) {
  if (!current) return current;
  if (current.servers.some((s) => s.id === serverId)) {
    current.activeServerId = serverId;
    persist();
  }
  return current;
}

/**
 * Bir sunucunun kanallarını döndür
 * @param {string} serverId
 * @returns {Array}
 */
export function getChannels(serverId) {
  if (!current || !serverId) return [];
  return [...(current.channelsByServer[serverId] || [])];
}

/**
 * Kanalı aynı kategori içinde yukarı/aşağı taşı
 * @param {string} serverId - Sunucu ID
 * @param {string} channelId - Kanal ID
 * @param {'up'|'down'} direction - Yön
 * @returns {object} Güncellenmiş workspace (aynı referans)
 */
export function moveChannel(serverId, channelId, direction) {
  if (!current || !serverId || !current.channelsByServer[serverId]) return current;
  const server = current.servers.find((s) => s.id === serverId);
  if (!server || server.ownerId !== getOwnerId()) return current;

  const channels = current.channelsByServer[serverId];
  const target = channels.find((c) => c.id === channelId);
  if (!target) return current;

  // Aynı parentId'ye ve aynı görsel gruba (metin/ses) sahip kardeşleri
  // bul, position'a göre sırala. Böylece metin kanalı ses kanalıyla yer
  // değiştirmez; kullanıcı listede gerçek bir yukarı/aşağı hareket görür.
  const groupOf = (t) => (t === 'VOICE' || t === 'STAGE' ? 'voice' : 'text');
  const siblings = channels
    .filter(
      (c) =>
        (c.parentId || null) === (target.parentId || null) &&
        groupOf(c.type) === groupOf(target.type)
    )
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const idx = siblings.findIndex((c) => c.id === channelId);
  if (idx === -1) return current;

  let swapIdx;
  if (direction === 'up' && idx > 0) {
    swapIdx = idx - 1;
  } else if (direction === 'down' && idx < siblings.length - 1) {
    swapIdx = idx + 1;
  } else {
    return current; // Taşıma mümkün değil
  }

  // Position değerlerini takas et
  const temp = target.position;
  target.position = siblings[swapIdx].position;
  siblings[swapIdx].position = temp;

  persist();
  return current;
}