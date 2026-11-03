/**
 * FAZ 5 Test Script
 * DM, Group DM, Emoji, Soundboard endpoint testleri
 */

const BASE_URL = 'http://localhost:3001';

let token1, token2, token3;
let userId1, userId2, userId3;
let conversationId, groupConversationId;
let emojiId, soundId;

// Helper: API request
async function api(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();
  return { status: res.status, data };
}

// Helper: Multipart upload
async function upload(path, formData, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function test() {
  console.log('🧪 FAZ 5 Test Başlıyor...\n');

  // ============================================================
  // TEST 1: Kullanıcı oluştur ve token al
  // ============================================================
  console.log('📝 Test 1: Kullanıcı oluşturma ve login');

  // User 1
  let res = await api('POST', '/api/auth/register', {
    username: 'testuser_faz5_1',
    password: 'Test123!@#',
    discriminator: '#5001',
  });
  if (res.status === 201 || res.data.error?.includes('already exists')) {
    res = await api('POST', '/api/auth/login', {
      username: 'testuser_faz5_1',
      password: 'Test123!@#',
    });
    token1 = res.data.token;
    userId1 = res.data.user.id;
    console.log(`✅ User 1: ${userId1}`);
  } else {
    console.error('❌ User 1 oluşturulamadı:', res.data);
    return;
  }

  // User 2
  res = await api('POST', '/api/auth/register', {
    username: 'testuser_faz5_2',
    password: 'Test123!@#',
    discriminator: '#5002',
  });
  if (res.status === 201 || res.data.error?.includes('already exists')) {
    res = await api('POST', '/api/auth/login', {
      username: 'testuser_faz5_2',
      password: 'Test123!@#',
    });
    token2 = res.data.token;
    userId2 = res.data.user.id;
    console.log(`✅ User 2: ${userId2}`);
  } else {
    console.error('❌ User 2 oluşturulamadı:', res.data);
    return;
  }

  // User 3
  res = await api('POST', '/api/auth/register', {
    username: 'testuser_faz5_3',
    password: 'Test123!@#',
    discriminator: '#5003',
  });
  if (res.status === 201 || res.data.error?.includes('already exists')) {
    res = await api('POST', '/api/auth/login', {
      username: 'testuser_faz5_3',
      password: 'Test123!@#',
    });
    token3 = res.data.token;
    userId3 = res.data.user.id;
    console.log(`✅ User 3: ${userId3}`);
  } else {
    console.error('❌ User 3 oluşturulamadı:', res.data);
    return;
  }

  // ============================================================
  // TEST 2: DM Conversation oluştur
  // ============================================================
  console.log('\n📝 Test 2: DM Conversation oluşturma');

  res = await api('POST', '/api/conversations/dm', { userId: userId2 }, token1);
  if (res.status === 201 && res.data.success) {
    conversationId = res.data.conversation.id;
    console.log(`✅ DM Conversation oluşturuldu: ${conversationId}`);
    console.log(`   Type: ${res.data.conversation.type}`);
    console.log(`   Members: ${res.data.conversation.members.length}`);
  } else {
    console.error('❌ DM Conversation oluşturulamadı:', res.data);
    return;
  }

  // ============================================================
  // TEST 3: Mevcut DM'yi tekrar iste (idempotent)
  // ============================================================
  console.log('\n📝 Test 3: Mevcut DM\'yi tekrar isteme');

  res = await api('POST', '/api/conversations/dm', { userId: userId2 }, token1);
  if (res.status === 200 && res.data.conversation.id === conversationId) {
    console.log('✅ Mevcut DM döndürüldü (idempotent)');
  } else {
    console.error('❌ Idempotent test başarısız');
    return;
  }

  // ============================================================
  // TEST 4: Conversation listesi
  // ============================================================
  console.log('\n📝 Test 4: Conversation listesi');

  res = await api('GET', '/api/conversations', null, token1);
  if (res.status === 200 && res.data.success) {
    console.log(`✅ Conversation listesi: ${res.data.conversations.length} conversation`);
  } else {
    console.error('❌ Conversation listesi alınamadı:', res.data);
    return;
  }

  // ============================================================
  // TEST 5: DM'ye mesaj gönder
  // ============================================================
  console.log('\n📝 Test 5: DM\'ye mesaj gönderme');

  res = await api(
    'POST',
    `/api/conversations/${conversationId}/messages`,
    { content: 'Merhaba, bu bir DM mesajı!' },
    token1
  );
  if (res.status === 201 && res.data.success) {
    console.log(`✅ DM mesajı gönderildi: ${res.data.message.id}`);
  } else {
    console.error('❌ DM mesajı gönderilemedi:', res.data);
    return;
  }

  // ============================================================
  // TEST 6: DM mesajlarını getir
  // ============================================================
  console.log('\n📝 Test 6: DM mesajlarını getirme');

  res = await api('GET', `/api/conversations/${conversationId}/messages`, null, token1);
  if (res.status === 200 && res.data.success) {
    console.log(`✅ DM mesajları: ${res.data.messages.length} mesaj`);
  } else {
    console.error('❌ DM mesajları alınamadı:', res.data);
    return;
  }

  // ============================================================
  // TEST 7: Group DM oluştur
  // ============================================================
  console.log('\n📝 Test 7: Group DM oluşturma');

  res = await api(
    'POST',
    '/api/conversations/group',
    { name: 'Test Group', userIds: [userId2, userId3] },
    token1
  );
  if (res.status === 201 && res.data.success) {
    groupConversationId = res.data.conversation.id;
    console.log(`✅ Group DM oluşturuldu: ${groupConversationId}`);
    console.log(`   Name: ${res.data.conversation.name}`);
    console.log(`   Members: ${res.data.conversation.members.length}`);
  } else {
    console.error('❌ Group DM oluşturulamadı:', res.data);
    return;
  }

  // ============================================================
  // TEST 8: Group DM'e member ekle
  // ============================================================
  console.log('\n📝 Test 8: Group DM\'e member ekleme');

  // User 4 oluştur
  res = await api('POST', '/api/auth/register', {
    username: 'testuser_faz5_4',
    password: 'Test123!@#',
    discriminator: '#5004',
  });
  if (res.status === 201 || res.data.error?.includes('already exists')) {
    res = await api('POST', '/api/auth/login', {
      username: 'testuser_faz5_4',
      password: 'Test123!@#',
    });
    const token4 = res.data.token;
    const userId4 = res.data.user.id;

    res = await api(
      'POST',
      `/api/conversations/${groupConversationId}/members`,
      { userId: userId4 },
      token1
    );
    if (res.status === 201 && res.data.success) {
      console.log(`✅ Member eklendi: ${userId4}`);
    } else {
      console.error('❌ Member eklenemedi:', res.data);
    }
  }

  // ============================================================
  // TEST 9: Group DM ismini değiştir
  // ============================================================
  console.log('\n📝 Test 9: Group DM ismini değiştirme');

  res = await api(
    'PUT',
    `/api/conversations/${groupConversationId}`,
    { name: 'Updated Group Name' },
    token1
  );
  if (res.status === 200 && res.data.success) {
    console.log(`✅ Group DM ismi değiştirildi: ${res.data.conversation.name}`);
  } else {
    console.error('❌ Group DM ismi değiştirilemedi:', res.data);
  }

  // ============================================================
  // TEST 10: Emoji oluştur (test için basit bir PNG oluştur)
  // ============================================================
  console.log('\n📝 Test 10: Emoji oluşturma');

  // Basit bir 1x1 PNG oluştur (base64)
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');

  const formData = new FormData();
  formData.append('name', 'test_emoji');
  formData.append('image', new Blob([pngBuffer], { type: 'image/png' }), 'test.png');

  res = await upload('/api/emojis', formData, token1);
  if (res.status === 201 && res.data.success) {
    emojiId = res.data.emoji.id;
    console.log(`✅ Emoji oluşturuldu: ${emojiId}`);
    console.log(`   Name: ${res.data.emoji.name}`);
    console.log(`   URL: ${res.data.emoji.url}`);
  } else {
    console.error('❌ Emoji oluşturulamadı:', res.data);
  }

  // ============================================================
  // TEST 11: Emoji listesi
  // ============================================================
  console.log('\n📝 Test 11: Emoji listesi');

  res = await api('GET', '/api/emojis', null, token1);
  if (res.status === 200 && res.data.success) {
    console.log(`✅ Emoji listesi: ${res.data.emojis.length} emoji`);
  } else {
    console.error('❌ Emoji listesi alınamadı:', res.data);
  }

  // ============================================================
  // TEST 12: Soundboard oluştur (test için basit bir MP3 oluştur)
  // ============================================================
  console.log('\n📝 Test 12: Soundboard oluşturma');

  // Basit bir MP3 header (gerçek ses değil, sadece test için)
  const mp3Buffer = Buffer.alloc(1024); // 1KB boş buffer
  const soundFormData = new FormData();
  soundFormData.append('name', 'test_sound');
  soundFormData.append('audio', new Blob([mp3Buffer], { type: 'audio/mpeg' }), 'test.mp3');

  res = await upload('/api/soundboard', soundFormData, token1);
  if (res.status === 201 && res.data.success) {
    soundId = res.data.sound.id;
    console.log(`✅ Sound oluşturuldu: ${soundId}`);
    console.log(`   Name: ${res.data.sound.name}`);
    console.log(`   URL: ${res.data.sound.url}`);
  } else {
    console.error('❌ Sound oluşturulamadı:', res.data);
  }

  // ============================================================
  // TEST 13: Soundboard listesi
  // ============================================================
  console.log('\n📝 Test 13: Soundboard listesi');

  res = await api('GET', '/api/soundboard', null, token1);
  if (res.status === 200 && res.data.success) {
    console.log(`✅ Sound listesi: ${res.data.sounds.length} sound`);
  } else {
    console.error('❌ Sound listesi alınamadı:', res.data);
  }

  // ============================================================
  // TEST 14: Emoji sil
  // ============================================================
  console.log('\n📝 Test 14: Emoji silme');

  if (emojiId) {
    res = await api('DELETE', `/api/emojis/${emojiId}`, null, token1);
    if (res.status === 200 && res.data.success) {
      console.log('✅ Emoji silindi');
    } else {
      console.error('❌ Emoji silinemedi:', res.data);
    }
  }

  // ============================================================
  // TEST 15: Sound sil
  // ============================================================
  console.log('\n📝 Test 15: Sound silme');

  if (soundId) {
    res = await api('DELETE', `/api/soundboard/${soundId}`, null, token1);
    if (res.status === 200 && res.data.success) {
      console.log('✅ Sound silindi');
    } else {
      console.error('❌ Sound silinemedi:', res.data);
    }
  }

  // ============================================================
  // TEST 16: Group DM'den member çıkar
  // ============================================================
  console.log('\n📝 Test 16: Group DM\'den member çıkarma');

  res = await api(
    'DELETE',
    `/api/conversations/${groupConversationId}/members/me`,
    null,
    token1
  );
  if (res.status === 200 && res.data.success) {
    console.log('✅ Kendim group DM\'den çıkarıldım');
  } else {
    console.error('❌ Group DM\'den çıkarılamadı:', res.data);
  }

  // ============================================================
  // TEST 17: Block kontrolü
  // ============================================================
  console.log('\n📝 Test 17: Block kontrolü');

  // User 2'yi blockla
  res = await api('POST', '/api/friends/block', { userId: userId2 }, token1);
  if (res.status === 200 || res.status === 201) {
    console.log('✅ User 2 blocklandı');

    // Block'lu kullanıcıyla DM oluşturmaya çalış
    res = await api('POST', '/api/conversations/dm', { userId: userId2 }, token1);
    if (res.status === 403 && res.data.error?.includes('blocked')) {
      console.log('✅ Block kontrolü çalışıyor (DM oluşturulamadı)');
    } else {
      console.error('❌ Block kontrolü başarısız:', res.data);
    }

    // Block'u kaldır
    res = await api('DELETE', `/api/friends/block/${userId2}`, null, token1);
    if (res.status === 200) {
      console.log('✅ Block kaldırıldı');
    }
  } else {
    console.error('❌ Block işlemi başarısız:', res.data);
  }

  console.log('\n✅ FAZ 5 Testleri Tamamlandı!');
}

test().catch((error) => {
  console.error('❌ Test hatası:', error);
  process.exit(1);
});