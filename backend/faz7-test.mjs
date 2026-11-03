/**
 * FAZ 7 - Ecosystem System Test
 * Tests: Webhooks, Notifications, Settings, Developer Mode, Discover
 */

import { io } from 'socket.io-client';

const BASE_URL = 'http://localhost:3001';

// Test users
let user1 = { token: '', userId: '', username: '' };
let user2 = { token: '', userId: '', username: '' };
let serverId = '';
let channelId = '';
let webhookId = '';
let webhookToken = '';
let notificationId = '';

// Helper functions
async function request(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();
  return { status: res.status, data };
}

async function register(username, password = 'Test123!') {
  const res = await request('POST', '/api/auth/register', { username, password });
  if (res.data.success) {
    return { token: res.data.token, userId: res.data.user.id, username: res.data.user.username };
  }
  // If user exists, login
  const loginRes = await request('POST', '/api/auth/login', { username, password });
  if (loginRes.data.success) {
    return { token: loginRes.data.token, userId: loginRes.data.user.id, username: loginRes.data.user.username };
  }
  throw new Error(`Failed to register/login: ${JSON.stringify(res.data)}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return false;
  }
}

// Main test suite
async function runTests() {
  console.log('🧪 FAZ 7 - Ecosystem System Tests\n');
  
  const results = [];
  
  // Setup: Register two users
  console.log('📝 Setup: Creating test users...');
  const timestamp = Date.now().toString().slice(-8); // Last 8 digits
  user1 = await register('faz7u1_' + timestamp);
  user2 = await register('faz7u2_' + timestamp);
  console.log(`✓ User 1: ${user1.username} (${user1.userId})`);
  console.log(`✓ User 2: ${user2.username} (${user2.userId})\n`);
  
  // Create a server
  const serverRes = await request('POST', '/api/servers', { name: 'FAZ7 Test Server' }, user1.token);
  if (!serverRes.data.success) throw new Error('Failed to create server');
  serverId = serverRes.data.server.id;
  channelId = serverRes.data.server.channels.find(c => c.type === 'TEXT')?.id;
  console.log(`✓ Server created: ${serverId}`);
  console.log(`✓ Text channel: ${channelId}\n`);
  
  // Add user2 to server
  const inviteRes = await request('POST', `/api/servers/${serverId}/invites`, {}, user1.token);
  if (inviteRes.data.success) {
    const inviteCode = inviteRes.data.invite.code;
    await request('POST', `/api/invites/${inviteCode}`, {}, user2.token);
  }
  
  // ========================================
  // WEBHOOK TESTS
  // ========================================
  console.log('🪝 WEBHOOK TESTS');
  
  results.push(await test('Create webhook (with permission)', async () => {
    const res = await request('POST', `/api/servers/${serverId}/webhooks`, {
      name: 'Test Webhook',
      channelId: channelId,
      avatar: 'https://example.com/avatar.png'
    }, user1.token);
    
    if (res.status !== 201) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!res.data.webhook.id) throw new Error('No webhook ID');
    if (!res.data.webhook.token) throw new Error('No webhook token');
    if (!res.data.webhook.url) throw new Error('No webhook URL');
    
    webhookId = res.data.webhook.id;
    webhookToken = res.data.webhook.token;
  }));
  
  results.push(await test('List webhooks', async () => {
    const res = await request('GET', `/api/servers/${serverId}/webhooks`, null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!Array.isArray(res.data.webhooks)) throw new Error('Not an array');
    if (res.data.webhooks.length === 0) throw new Error('No webhooks');
  }));
  
  results.push(await test('Execute webhook (public, no auth)', async () => {
    const res = await request('POST', `/api/webhooks/${webhookId}/${webhookToken}`, {
      content: 'Hello from webhook!',
      username: 'Webhook Bot',
      avatarUrl: 'https://example.com/bot.png'
    });
    
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!res.data.message.id) throw new Error('No message ID');
    if (!res.data.message.webhook) throw new Error('Not marked as webhook');
    if (res.data.message.webhookName !== 'Webhook Bot') throw new Error('Wrong webhook name');
  }));
  
  results.push(await test('Execute webhook with invalid token (should fail)', async () => {
    const res = await request('POST', `/api/webhooks/${webhookId}/invalid-token`, {
      content: 'Should fail'
    });
    
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  }));
  
  results.push(await test('Create webhook without permission (user2)', async () => {
    const res = await request('POST', `/api/servers/${serverId}/webhooks`, {
      name: 'Unauthorized Webhook',
      channelId: channelId
    }, user2.token);
    
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  }));
  
  results.push(await test('Delete webhook', async () => {
    const res = await request('DELETE', `/api/webhooks/${webhookId}`, null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
  }));
  
  // ========================================
  // NOTIFICATION TESTS
  // ========================================
  console.log('\n🔔 NOTIFICATION TESTS');
  
  // Create a notification directly in DB for testing
  const { default: prisma } = await import('./src/lib/prisma.js');
  const notif = await prisma.notification.create({
    data: {
      userId: user1.userId,
      type: 'MENTION',
      title: 'You were mentioned',
      message: 'User2 mentioned you in #general',
      metadata: JSON.stringify({ channelId, messageId: 'test-msg-id' })
    }
  });
  notificationId = notif.id;
  
  results.push(await test('Get notifications', async () => {
    const res = await request('GET', '/api/notifications', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!Array.isArray(res.data.notifications)) throw new Error('Not an array');
    if (res.data.notifications.length === 0) throw new Error('No notifications');
    if (!res.data.pagination) throw new Error('No pagination');
  }));
  
  results.push(await test('Mark notification as read', async () => {
    const res = await request('PUT', `/api/notifications/${notificationId}/read`, null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!res.data.notification.read) throw new Error('Not marked as read');
  }));
  
  // Create more notifications for read-all test
  await prisma.notification.createMany({
    data: [
      { userId: user1.userId, type: 'FRIEND_REQUEST', title: 'Friend request', message: 'User2 wants to be friends' },
      { userId: user1.userId, type: 'SERVER_INVITE', title: 'Server invite', message: 'You were invited to a server' }
    ]
  });
  
  results.push(await test('Mark all notifications as read', async () => {
    const res = await request('PUT', '/api/notifications/read-all', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (res.data.count < 2) throw new Error(`Expected at least 2, got ${res.data.count}`);
  }));
  
  results.push(await test('Get notifications (unreadOnly filter)', async () => {
    const res = await request('GET', '/api/notifications?unreadOnly=true', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    // All should be read now
    const unread = res.data.notifications.filter(n => !n.read);
    if (unread.length > 0) throw new Error('Found unread notifications');
  }));
  
  results.push(await test('Access other user notification (should fail)', async () => {
    const res = await request('PUT', `/api/notifications/${notificationId}/read`, null, user2.token);
    
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
  }));
  
  // ========================================
  // SETTINGS TESTS
  // ========================================
  console.log('\n⚙️  SETTINGS TESTS');
  
  results.push(await test('Get user settings (auto-create)', async () => {
    const res = await request('GET', '/api/users/me/settings', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!res.data.settings) throw new Error('No settings');
    if (res.data.settings.theme !== 'DARK') throw new Error('Wrong default theme');
    if (res.data.settings.language !== 'tr') throw new Error('Wrong default language');
    if (!res.data.settings.notifications) throw new Error('No notifications settings');
    if (!res.data.settings.privacy) throw new Error('No privacy settings');
    if (!res.data.settings.audio) throw new Error('No audio settings');
  }));
  
  results.push(await test('Update settings (partial)', async () => {
    const res = await request('PUT', '/api/users/me/settings', {
      theme: 'LIGHT',
      notifications: { sound: false }
    }, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (res.data.settings.theme !== 'LIGHT') throw new Error('Theme not updated');
    if (res.data.settings.notifications.sound !== false) throw new Error('Sound not updated');
    if (res.data.settings.notifications.desktop !== true) throw new Error('Desktop should still be true');
  }));
  
  results.push(await test('Update audio settings', async () => {
    const res = await request('PUT', '/api/users/me/settings', {
      audio: { inputVolume: 75, noiseSuppression: false }
    }, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.settings.audio.inputVolume !== 75) throw new Error('Input volume not updated');
    if (res.data.settings.audio.noiseSuppression !== false) throw new Error('Noise suppression not updated');
    if (res.data.settings.audio.outputVolume !== 100) throw new Error('Output volume should still be 100');
  }));
  
  results.push(await test('Invalid theme (should fail)', async () => {
    const res = await request('PUT', '/api/users/me/settings', { theme: 'INVALID' }, user1.token);
    
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  }));
  
  results.push(await test('Invalid audio volume (should fail)', async () => {
    const res = await request('PUT', '/api/users/me/settings', { audio: { inputVolume: 150 } }, user1.token);
    
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  }));
  
  // ========================================
  // DEVELOPER MODE TESTS
  // ========================================
  console.log('\n👨‍💻 DEVELOPER MODE TESTS');
  
  results.push(await test('Get developer mode (default off)', async () => {
    const res = await request('GET', '/api/users/me/developer', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (res.data.developerMode !== false) throw new Error('Should be false by default');
  }));
  
  results.push(await test('Enable developer mode', async () => {
    const res = await request('PUT', '/api/users/me/developer', { developerMode: true }, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!res.data.developerMode) throw new Error('Not enabled');
    if (!res.data.clientId) throw new Error('No clientId generated');
  }));
  
  results.push(await test('Disable developer mode', async () => {
    const res = await request('PUT', '/api/users/me/developer', { developerMode: false }, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.developerMode) throw new Error('Not disabled');
    // clientId should still exist
    if (!res.data.clientId) throw new Error('clientId should persist');
  }));
  
  results.push(await test('Invalid developerMode value (should fail)', async () => {
    const res = await request('PUT', '/api/users/me/developer', { developerMode: 'yes' }, user1.token);
    
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  }));
  
  // ========================================
  // DISCOVER TESTS
  // ========================================
  console.log('\n🔍 DISCOVER TESTS');
  
  // Create some categories (skip if already exist)
  try {
    await prisma.serverCategory.createMany({
      data: [
        { id: 'gaming', name: 'Oyun', icon: '🎮', serverCount: 0 },
        { id: 'music', name: 'Müzik', icon: '🎵', serverCount: 0 },
        { id: 'education', name: 'Eğitim', icon: '📚', serverCount: 0 }
      ],
      skipDuplicates: true
    });
  } catch (e) {
    // Categories may already exist, that's OK
  }
  
  // Make server public with category
  await prisma.server.update({
    where: { id: serverId },
    data: {
      isPublic: true,
      category: 'gaming',
      tags: JSON.stringify(['test', 'faz7']),
      description: 'FAZ 7 test server for discovery'
    }
  });
  
  results.push(await test('Get discover categories', async () => {
    const res = await request('GET', '/api/discover/categories', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!Array.isArray(res.data.categories)) throw new Error('Not an array');
    if (res.data.categories.length < 3) throw new Error('Not enough categories');
  }));
  
  results.push(await test('Get discover servers', async () => {
    const res = await request('GET', '/api/discover/servers', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.success) throw new Error('Not successful');
    if (!Array.isArray(res.data.servers)) throw new Error('Not an array');
    if (res.data.servers.length === 0) throw new Error('No public servers');
    if (!res.data.pagination) throw new Error('No pagination');
  }));
  
  results.push(await test('Filter by category', async () => {
    const res = await request('GET', '/api/discover/servers?category=gaming', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.servers.length === 0) throw new Error('No gaming servers');
    if (res.data.servers[0].category !== 'gaming') throw new Error('Wrong category');
  }));
  
  results.push(await test('Search servers', async () => {
    const res = await request('GET', '/api/discover/servers?search=FAZ7', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.servers.length === 0) throw new Error('No matching servers');
  }));
  
  results.push(await test('Pagination', async () => {
    const res = await request('GET', '/api/discover/servers?limit=1&offset=0', null, user1.token);
    
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.data.servers.length > 1) throw new Error('Limit not respected');
    if (res.data.pagination.limit !== 1) throw new Error('Wrong limit in pagination');
    if (res.data.pagination.offset !== 0) throw new Error('Wrong offset in pagination');
  }));
  
  // ========================================
  // SOCKET CONNECTION TEST
  // ========================================
  console.log('\n🔌 SOCKET CONNECTION TEST');
  
  results.push(await test('Socket authentication and connection', async () => {
    return new Promise((resolve, reject) => {
      const socket = io(BASE_URL, {
        auth: { token: user1.token },
        timeout: 5000
      });
      
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timeout waiting for connection'));
      }, 5000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.disconnect();
        resolve();
      });
      
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Socket connection error: ${err.message}`));
      });
    });
  }));
  
  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n' + '='.repeat(50));
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`\n📊 TEST SUMMARY: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('✅ ALL TESTS PASSED!');
    process.exit(0);
  } else {
    console.log(`❌ ${total - passed} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
