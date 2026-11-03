/**
 * Security Fixes Test Script (FAZ 5)
 * Tests:
 * 1. Emoji Delete Permission Check (MANAGE_EMOJIS)
 * 2. DM Idempotency Query Fix
 */

const BASE_URL = 'http://localhost:3001';

let token1, token2, token3;
let userId1, userId2, userId3;
let serverId;
let emojiId;
let dmConversationId;

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
  console.log('🧪 Security Fixes Test Başlıyor...\n');

  // ============================================================
  // SETUP: Create users and server
  // ============================================================
  console.log('📝 Setup: Creating users...');
  
  // User 1 (Admin/Owner)
  let res = await api('POST', '/api/auth/register', {
    username: 'security_admin',
    email: 'sec_admin@test.com',
    password: 'Password123!',
  });
  if (res.status === 201 || res.status === 409) {
    if (res.status === 409) {
      res = await api('POST', '/api/auth/login', {
        username: 'security_admin',
        password: 'Password123!',
      });
    }
    token1 = res.data.token;
    userId1 = res.data.user.id;
    console.log(`✅ User 1 created: ${userId1}`);
  }

  // User 2 (Regular member)
  res = await api('POST', '/api/auth/register', {
    username: 'security_member',
    email: 'sec_member@test.com',
    password: 'Password123!',
  });
  if (res.status === 201 || res.status === 409) {
    if (res.status === 409) {
      res = await api('POST', '/api/auth/login', {
        username: 'security_member',
        password: 'Password123!',
      });
    }
    token2 = res.data.token;
    userId2 = res.data.user.id;
    console.log(`✅ User 2 created: ${userId2}`);
  }

  // User 3 (Another regular member)
  res = await api('POST', '/api/auth/register', {
    username: 'security_member2',
    email: 'sec_member2@test.com',
    password: 'Password123!',
  });
  if (res.status === 201 || res.status === 409) {
    if (res.status === 409) {
      res = await api('POST', '/api/auth/login', {
        username: 'security_member2',
        password: 'Password123!',
      });
    }
    token3 = res.data.token;
    userId3 = res.data.user.id;
    console.log(`✅ User 3 created: ${userId3}`);
  }

  // Create Server
  console.log('\n🏗️ Creating server...');
  res = await api('POST', '/api/servers', {
    name: 'Security Test Server',
  }, token1);
  if (res.status === 201) {
    serverId = res.data.server.id;
    console.log(`✅ Server created: ${serverId}`);
  } else {
    console.error('❌ Failed to create server:', res.data);
    process.exit(1);
  }

  // Add User 2 and User 3 to server
  console.log('\n👥 Adding members to server...');
  await api('POST', `/api/servers/${serverId}/members`, { userId: userId2 }, token1);
  await api('POST', `/api/servers/${serverId}/members`, { userId: userId3 }, token1);
  console.log('✅ Members added');

  // ============================================================
  // TEST 1: Emoji Delete Permission Check
  // ============================================================
  console.log('\n🔴 TEST 1: Emoji Delete Permission Check');
  
  // Create a dummy image buffer for emoji upload
  const dummyImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAACAIAAADK8sZbAAAACXBIWXMAAAsTAAALEwEAmpwYAAAADUlEQVQI12P4z8BQDwAE/wH/gNj+OQAAAABJRU5ErkJggg==',
    'base64'
  );
  
  const blob = new Blob([dummyImageBuffer], { type: 'image/png' });
  const formData = new FormData();
  formData.append('image', blob, 'test.png');
  formData.append('name', 'security_test_emoji');
  formData.append('serverId', serverId);

  // Upload emoji as User 1 (Owner)
  console.log('📤 Uploading emoji as Owner (User 1)...');
  res = await upload('/api/emojis', formData, token1);
  if (res.status === 201) {
    emojiId = res.data.emoji.id;
    console.log(`✅ Emoji uploaded: ${emojiId}`);
  } else {
    console.error('❌ Failed to upload emoji:', res.data);
    process.exit(1);
  }

  // Try to delete emoji as User 2 (Regular member, no permissions)
  console.log('🚫 Attempting to delete emoji as Regular Member (User 2)...');
  res = await api('DELETE', `/api/emojis/${emojiId}`, null, token2);
  if (res.status === 403) {
    console.log('✅ PASS: Regular member correctly denied (403)');
  } else {
    console.error(`❌ FAIL: Expected 403, got ${res.status}:`, res.data);
  }

  // Try to delete emoji as User 3 (Regular member, no permissions)
  console.log('🚫 Attempting to delete emoji as Another Regular Member (User 3)...');
  res = await api('DELETE', `/api/emojis/${emojiId}`, null, token3);
  if (res.status === 403) {
    console.log('✅ PASS: Another regular member correctly denied (403)');
  } else {
    console.error(`❌ FAIL: Expected 403, got ${res.status}:`, res.data);
  }

  // Delete emoji as User 1 (Owner)
  console.log('🗑️ Deleting emoji as Owner (User 1)...');
  res = await api('DELETE', `/api/emojis/${emojiId}`, null, token1);
  if (res.status === 200) {
    console.log('✅ PASS: Owner successfully deleted emoji');
  } else {
    console.error(`❌ FAIL: Owner failed to delete emoji:`, res.data);
  }

  // ============================================================
  // TEST 2: DM Idempotency Query Fix
  // ============================================================
  console.log('\n🔴 TEST 2: DM Idempotency Query Fix');

  // Create DM between User 1 and User 2
  console.log('💬 Creating DM between User 1 and User 2...');
  res = await api('POST', '/api/conversations/dm', { userId: userId2 }, token1);
  if (res.status === 201) {
    dmConversationId = res.data.conversation.id;
    console.log(`✅ DM created: ${dmConversationId}`);
    console.log(`   Members: ${res.data.conversation.members.length}`);
  } else {
    console.error('❌ Failed to create DM:', res.data);
    process.exit(1);
  }

  // Try to create same DM again (should return existing)
  console.log('💬 Attempting to create same DM again (idempotency check)...');
  res = await api('POST', '/api/conversations/dm', { userId: userId2 }, token1);
  if (res.status === 200 && res.data.conversation.id === dmConversationId) {
    console.log('✅ PASS: Existing DM returned correctly (idempotent)');
    console.log(`   Returned conversation ID: ${res.data.conversation.id}`);
    console.log(`   Members: ${res.data.conversation.members.length}`);
  } else {
    console.error(`❌ FAIL: Expected existing DM, got status ${res.status}:`, res.data);
  }

  // Verify member count is exactly 2
  if (res.data.conversation.members.length === 2) {
    console.log('✅ PASS: DM has exactly 2 members');
  } else {
    console.error(`❌ FAIL: DM has ${res.data.conversation.members.length} members, expected 2`);
  }

  // Create DM between User 1 and User 3 (different pair)
  console.log('\n💬 Creating DM between User 1 and User 3...');
  res = await api('POST', '/api/conversations/dm', { userId: userId3 }, token1);
  if (res.status === 201) {
    const dmWithUser3 = res.data.conversation.id;
    console.log(`✅ New DM created with User 3: ${dmWithUser3}`);
    
    // Verify it's different from the first DM
    if (dmWithUser3 !== dmConversationId) {
      console.log('✅ PASS: Different DM created for different user pair');
    } else {
      console.error('❌ FAIL: Same conversation ID returned for different user pair');
    }
  } else {
    console.error('❌ Failed to create DM with User 3:', res.data);
  }

  console.log('\n✅ Security Fixes Test Completed!');
}

test().catch((err) => {
  console.error('💥 Test failed with error:', err);
  process.exit(1);
});
