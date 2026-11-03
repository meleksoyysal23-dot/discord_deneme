/**
 * FAZ 2 - Authentication, Profile, Friends & Blocks Test Suite
 * Comprehensive test for all implemented features
 */

const BASE_URL = 'http://localhost:3001';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m',
  };
  console.log(`${colors.gray}${timestamp}${colors.reset} ${colors[type]}[${type.toUpperCase()}]${colors.reset} ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    log(`✓ ${name}`, 'success');
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: error.message });
    log(`✗ ${name}: ${error.message}`, 'error');
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function runTests() {
  log('Starting FAZ 2 Test Suite...', 'info');
  log('='.repeat(60), 'info');

  // Clean up test data (optional - for fresh test runs)
  // await cleanupTestData();

  // ============================================================
  // AUTHENTICATION TESTS
  // ============================================================

  log('\n📝 AUTHENTICATION TESTS', 'info');

  await test('POST /api/auth/register - Valid registration', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        username: `testuser_${Date.now()}`,
        password: 'password123',
        displayName: 'Test User',
      }),
    });
    if (status !== 201) throw new Error(`Expected 201, got ${status}`);
    if (!data.success) throw new Error('Registration failed');
    if (!data.token) throw new Error('No token returned');
    if (!data.user.discriminator) throw new Error('No discriminator assigned');
  });

  await test('POST /api/auth/register - Duplicate username', async () => {
    const username = `duplicate_${Date.now()}`;
    await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    if (status !== 409) throw new Error(`Expected 409, got ${status}`);
    if (data.error !== 'Username already taken') throw new Error('Wrong error message');
  });

  await test('POST /api/auth/register - Username too short', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: 'ab', password: 'password123' }),
    });
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    if (!data.error.includes('at least 3 characters')) throw new Error('Wrong validation error');
  });

  await test('POST /api/auth/register - Password too short', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: 'validuser', password: '123' }),
    });
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
    if (!data.error.includes('at least 6 characters')) throw new Error('Wrong validation error');
  });

  await test('POST /api/auth/login - Valid credentials', async () => {
    const username = `login_${Date.now()}`;
    await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.success) throw new Error('Login failed');
    if (!data.token) throw new Error('No token returned');
  });

  await test('POST /api/auth/login - Invalid password', async () => {
    const username = `invalid_${Date.now()}`;
    await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'wrongpassword' }),
    });
    if (status !== 401) throw new Error(`Expected 401, got ${status}`);
    if (data.error !== 'Invalid username or password') throw new Error('Wrong error message');
  });

  await test('GET /api/auth/me - Valid token', async () => {
    const username = `me_${Date.now()}`;
    const { data: regData } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.user.username !== username) throw new Error('Wrong user returned');
  });

  await test('GET /api/auth/me - No token', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/me`);
    if (status !== 401) throw new Error(`Expected 401, got ${status}`);
    if (data.error !== 'Access token required') throw new Error('Wrong error message');
  });

  await test('PUT /api/auth/me - Update profile', async () => {
    const username = `update_${Date.now()}`;
    const { data: regData } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/me`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${regData.token}` },
      body: JSON.stringify({
        displayName: 'Updated Name',
        status: 'DND',
        customStatus: '🎮 Gaming',
      }),
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (data.user.displayName !== 'Updated Name') throw new Error('Display name not updated');
    if (data.user.status !== 'DND') throw new Error('Status not updated');
    if (data.user.customStatus !== '🎮 Gaming') throw new Error('Custom status not updated');
  });

  // ============================================================
  // DISCRIMINATOR TESTS
  // ============================================================

  log('\n🔢 DISCRIMINATOR TESTS', 'info');

  await test('Discriminator format - #1234', async () => {
    const username = `disc_${Date.now()}`;
    const { data } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    if (!/^\d{4}$/.test(data.user.discriminator)) {
      throw new Error(`Invalid discriminator format: ${data.user.discriminator}`);
    }
  });

  await test('Discriminator uniqueness', async () => {
    const username = `unique_${Date.now()}`;
    const { data: user1 } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    const { data: user2 } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: `${username}_2`, password: 'password123' }),
    });
    if (user1.user.discriminator === user2.user.discriminator) {
      throw new Error('Discriminators should be unique');
    }
  });

  // ============================================================
  // FRIENDS TESTS
  // ============================================================

  log('\n👥 FRIENDS TESTS', 'info');

  let user1Token, user2Token, user2Username;

  await test('Setup - Create two users', async () => {
    const username1 = `friend1_${Date.now()}`;
    const username2 = `friend2_${Date.now()}`;
    const { data: reg1 } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: username1, password: 'password123' }),
    });
    const { data: reg2 } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: username2, password: 'password123' }),
    });
    user1Token = reg1.token;
    user2Token = reg2.token;
    user2Username = `${reg2.user.username}#${reg2.user.discriminator}`;
  });

  await test('POST /api/friends/request - Send friend request', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ username: user2Username }),
    });
    if (status !== 201) throw new Error(`Expected 201, got ${status}`);
    if (!data.requestId) throw new Error('No requestId returned');
  });

  await test('POST /api/friends/request - Self request blocked', async () => {
    const { data: reg } = await fetchJSON(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const selfUsername = `${reg.user.username}#${reg.user.discriminator}`;
    const { status } = await fetchJSON(`${BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ username: selfUsername }),
    });
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
  });

  await test('GET /api/friends - List pending requests', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.pendingRequests.incoming || data.pendingRequests.incoming.length === 0) {
      throw new Error('No incoming requests found');
    }
  });

  let requestId;
  await test('Get request ID for accept test', async () => {
    const { data } = await fetchJSON(`${BASE_URL}/api/friends`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    requestId = data.pendingRequests.incoming[0].id;
    if (!requestId) throw new Error('No request ID found');
  });

  await test('PUT /api/friends/request/:id/accept - Accept request', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends/request/${requestId}/accept`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.success) throw new Error('Accept failed');
  });

  await test('GET /api/friends - Verify friendship', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.friends || data.friends.length === 0) {
      throw new Error('Friendship not established');
    }
  });

  let friendshipId;
  await test('Get friendship ID for delete test', async () => {
    const { data } = await fetchJSON(`${BASE_URL}/api/friends`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    friendshipId = data.friends[0].id;
    if (!friendshipId) throw new Error('No friendship ID found');
  });

  await test('DELETE /api/friends/:id - Remove friendship', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends/${friendshipId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.success) throw new Error('Delete failed');
  });

  // ============================================================
  // BLOCKS TESTS
  // ============================================================

  log('\n🚫 BLOCKS TESTS', 'info');

  let user3Id;

  await test('Setup - Create third user', async () => {
    const username3 = `block_${Date.now()}`;
    const { data: reg } = await fetchJSON(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ username: username3, password: 'password123' }),
    });
    user3Id = reg.user.id;
  });

  await test('POST /api/blocks - Block user', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends/blocks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ userId: user3Id }),
    });
    if (status !== 201) throw new Error(`Expected 201, got ${status}`);
    if (!data.success) throw new Error('Block failed');
  });

  await test('POST /api/blocks - Self block blocked', async () => {
    const { data: reg } = await fetchJSON(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const { status } = await fetchJSON(`${BASE_URL}/api/friends/blocks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ userId: reg.user.id }),
    });
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
  });

  await test('GET /api/blocks - List blocked users', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends/blocks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.blockedUsers || data.blockedUsers.length === 0) {
      throw new Error('No blocked users found');
    }
  });

  await test('DELETE /api/blocks/:userId - Unblock user', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}/api/friends/blocks/${user3Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    if (!data.success) throw new Error('Unblock failed');
  });

  // ============================================================
  // RESULTS
  // ============================================================

  log('\n' + '='.repeat(60), 'info');
  log('TEST RESULTS', 'info');
  log('='.repeat(60), 'info');
  log(`Total: ${results.passed + results.failed}`, 'info');
  log(`Passed: ${results.passed}`, 'success');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'error' : 'info');

  if (results.failed > 0) {
    log('\nFailed tests:', 'error');
    results.tests
      .filter((t) => t.status === 'FAIL')
      .forEach((t) => log(`  - ${t.name}: ${t.error}`, 'error'));
  }

  log('\n' + '='.repeat(60), 'info');

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
