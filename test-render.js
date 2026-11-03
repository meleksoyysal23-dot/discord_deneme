/**
 * Render Sunucusu Test Scripti
 * Bu script Render'daki backend'e HTTP POST isteği atar ve detaylı yanıt bilgisi gösterir.
 *
 * Kullanım: node test-render.js [username]
 * Örnek: node test-render.js testuser123
 */

const BACKEND_URL = 'https://discord-deneme-klyz.onrender.com';
const testUsername = process.argv[2] || `testuser_${Date.now()}`;

console.log('='.repeat(60));
console.log('🧪 RENDER SUNUCUSU TEST SCRIPTİ');
console.log('='.repeat(60));
console.log(`\n📍 Backend URL: ${BACKEND_URL}`);
console.log(`👤 Test Username: ${testUsername}`);
console.log(`🕐 Test Zamanı: ${new Date().toISOString()}\n`);

async function testLogin() {
  console.log('📤 Login isteği gönderiliyor...\n');

  const startTime = Date.now();

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        username: testUsername,
        password: '' // Şifresiz giriş
      }),
    });

    const duration = Date.now() - startTime;

    console.log('📥 Yanıt alındı:');
    console.log('-'.repeat(60));
    console.log(`✅ HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`⏱️  Süre: ${duration}ms`);
    console.log(`🔗 URL: ${response.url}`);

    console.log('\n📋 Response Headers:');
    response.headers.forEach((value, key) => {
      console.log(`   ${key}: ${value}`);
    });

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
      console.log('\n📦 Response Body (JSON):');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log('\n📄 Response Body (Text):');
      console.log(text);

      // JSON parse etmeyi dene
      try {
        data = JSON.parse(text);
        console.log('\n📦 Parsed JSON:');
        console.log(JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('\n⚠️  Response JSON değil');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SONUCU:');
    console.log('='.repeat(60));

    if (response.ok && data?.success === true) {
      console.log('✅ BAŞARILI!');
      console.log(`   User ID: ${data.user?.id}`);
      console.log(`   Username: ${data.user?.username}#${data.user?.discriminator}`);
      console.log(`   Token: ${data.token?.substring(0, 50)}...`);
      console.log('\n🎉 Şifresiz giriş sistemi çalışıyor!');
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log(`   HTTP Status: ${response.status}`);
      console.log(`   Error: ${data?.error || data?.message || 'Bilinmiyor'}`);

      if (response.status === 500) {
        console.log('\n🔍 OLASI SEBEPLER:');
        console.log('   1. JWT_SECRET environment değişkeni eksik');
        console.log('   2. Database bağlantı hatası');
        console.log('   3. Prisma migration eksik');
        console.log('   4. Backend kod hatası');
        console.log('\n💡 ÇÖZÜM:');
        console.log('   Render panelinden Environment Variables kontrol et:');
        console.log('   - JWT_SECRET tanımlı mı?');
        console.log('   - DATABASE_URL doğru mu?');
        console.log('   - Render loglarını kontrol et');
      } else if (response.status === 400) {
        console.log('\n🔍 OLASI SEBEPLER:');
        console.log('   1. Username validation hatası (3-20 karakter)');
        console.log('   2. Geçersiz karakter kullanımı');
        console.log(`   \n💡 Username: "${testUsername}" (${testUsername.length} karakter)`);
      } else if (response.status === 503) {
        console.log('\n🔍 OLASI SEBEPLER:');
        console.log('   1. Render sunucusu uyanıyor (cold start)');
        console.log('   2. Sunucu bakımda');
        console.log('   \n💡 Biraz bekleyip tekrar dene');
      }
    }

  } catch (error) {
    const duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(60));
    console.log('❌ BAĞLANTI HATASI:');
    console.log('='.repeat(60));
    console.log(`⏱️  Süre: ${duration}ms`);
    console.log(`\n🔴 Hata: ${error.message}`);

    if (error.name === 'FetchError' || error.message.includes('fetch')) {
      console.log('\n🔍 OLASI SEBEPLER:');
      console.log('   1. İnternet bağlantısı yok');
      console.log('   2. DNS çözümlemesi başarısız');
      console.log('   3. Firewall/Proxy engeli');
      console.log('   4. Render URL yanlış');
    } else if (error.message.includes('CORS')) {
      console.log('\n🔍 OLASI SEBEPLER:');
      console.log('   1. CORS politikası engeli');
      console.log('   2. Backend CORS ayarları yanlış');
    }

    console.log('\n💡 ÇÖZÜM:');
    console.log('   - İnternet bağlantını kontrol et');
    console.log('   - Render URL\'ini kontrol et: ' + BACKEND_URL);
    console.log('   - Tarayıcıdan health check dene: ' + BACKEND_URL + '/api/health');
  }

  console.log('\n' + '='.repeat(60));
}

// Health check testi
async function testHealth() {
  console.log('\n🏥 Health check testi yapılıyor...\n');

  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    const data = await response.json();

    console.log('✅ Health check başarılı:');
    console.log(`   Status: ${data.status}`);
    console.log(`   Uptime: ${data.uptime}`);
    console.log(`   Timestamp: ${data.timestamp}`);
  } catch (error) {
    console.log('❌ Health check başarısız:');
    console.log(`   Hata: ${error.message}`);
  }
}

// Testleri çalıştır
(async () => {
  await testHealth();
  console.log('\n');
  await testLogin();
})();
