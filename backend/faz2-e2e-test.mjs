/**
 * FAZ 2 - End-to-End Runtime Test
 * Tests all API endpoints against the running server
 * All usernames kept <= 20 chars (validation limit)
 */

const BASE = 'http://localhost:3001';
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

async function req(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  console.log('\n=== FAZ 2 E2E TESTS ===\n');

  // Health check
  await test('GET /api/health', async () => {
    const { status, data } = await req('GET', '/api/health');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.status === 'ok', 'Health not ok');
  });

  // Use short suffix (6 digits) to keep usernames <= 20 chars
  const ts = Date.now().toString().slice(-6);
  const U1 = `eu1_${ts}`;       // 9 chars
  const U2 = `eu2_${ts}`;       // 9 chars
  const U3 = `eu3_${ts}`;       // 9 chars
  const U4 = `eu4_${ts}`;       // 9 chars
  const U1DUP = `dup_${ts}`;    // 8 chars

  let user1Token, user1Id, user1Disc;
  await test('POST /api/auth/register - user1', async () => {
    const { status, data } = await req('POST', '/api/auth/register', {
      username: U1,
      password: 'password123',
      displayName: 'E2E User 1',
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert(data.success === true, 'success not true');
    assert(data.token, 'no token');
    assert(data.user.discriminator, 'no discriminator');
    assert(/^\d{4}$/.test(data.user.discriminator), `bad discriminator: ${data.user.discriminator}`);
    user1Token = data.token;
    user1Id = data.user.id;
    user1Disc = data.user.discriminator;
  });

  let user2Token, user2Id, user2Disc, user2Username;
  await test('POST /api/auth/register - user2', async () => {
    const { status, data } = await req('POST', '/api/auth/register', {
      username: U2,
      password: 'password123',
      displayName: 'E2E User 2',
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    user2Token = data.token;
    user2Id = data.user.id;
    user2Disc = data.user.discriminator;
    user2Username = `${data.user.username}#${data.user.discriminator}`;
  });

  await test('POST /api/auth/register - duplicate rejected', async () => {
    const { status } = await req('POST', '/api/auth/register', {
      username: U1,
      password: 'password123',
    });
    assert(status === 409, `Expected 409, got ${status}`);
  });

  await test('POST /api/auth/register - short username rejected', async () => {
    const { status } = await req('POST', '/api/auth/register', {
      username: 'ab',
      password: 'password123',
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await test('POST /api/auth/register - short password rejected', async () => {
    const { status } = await req('POST', '/api/auth/register', {
      username: 'validuser',
      password: '123',
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await test('POST /api/auth/login - valid', async () => {
    const { status, data } = await req('POST', '/api/auth/login', {
      username: U1,
      password: 'password123',
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.token, 'no token');
    assert(data.user.username === U1, 'wrong user');
  });

  await test('POST /api/auth/login - with discriminator', async () => {
    const { status, data } = await req('POST', '/api/auth/login', {
      username: `${U1}#${user1Disc}`,
      password: 'password123',
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.token, 'no token');
  });

  await test('POST /api/auth/login - wrong password', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      username: U1,
      password: 'wrongpass',
    });
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test('GET /api/auth/me - with token', async () => {
    const { status, data } = await req('GET', '/api/auth/me', null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.user.id === user1Id, 'wrong user id');
    assert(data.user.username === U1, 'wrong username');
  });

  await test('GET /api/auth/me - no token rejected', async () => {
    const { status } = await req('GET', '/api/auth/me');
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test('PUT /api/auth/me - update profile', async () => {
    const { status, data } = await req('PUT', '/api/auth/me', {
      displayName: 'Updated Name',
      status: 'DND',
      customStatus: '🎮 Gaming',
      about: 'Test bio',
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.user.displayName === 'Updated Name', 'displayName not updated');
    assert(data.user.status === 'DND', 'status not updated');
    assert(data.user.customStatus === '🎮 Gaming', 'customStatus not updated');
    assert(data.user.about === 'Test bio', 'about not updated');
  });

  await test('PUT /api/auth/me - invalid status rejected', async () => {
    const { status } = await req('PUT', '/api/auth/me', {
      status: 'INVALID',
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  // FRIENDS
  let requestId;
  await test('POST /api/friends/request - send', async () => {
    const { status, data } = await req('POST', '/api/friends/request', {
      username: user2Username,
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert(data.requestId, 'no requestId');
    requestId = data.requestId;
  });

  await test('POST /api/friends/request - self blocked', async () => {
    const selfName = `${U1}#${user1Disc}`;
    const { status } = await req('POST', '/api/friends/request', {
      username: selfName,
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await test('POST /api/friends/request - duplicate blocked', async () => {
    const { status } = await req('POST', '/api/friends/request', {
      username: user2Username,
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 409, `Expected 409, got ${status}`);
  });

  await test('GET /api/friends - user2 sees incoming', async () => {
    const { status, data } = await req('GET', '/api/friends', null, {
      Authorization: `Bearer ${user2Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.pendingRequests.incoming.length >= 1, 'no incoming requests');
    assert(data.pendingRequests.incoming[0].from.username === U1, 'wrong sender');
  });

  await test('PUT /api/friends/request/:id/accept', async () => {
    const { status, data } = await req('PUT', `/api/friends/request/${requestId}/accept`, null, {
      Authorization: `Bearer ${user2Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  });

  await test('GET /api/friends - user1 sees friend', async () => {
    const { status, data } = await req('GET', '/api/friends', null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.friends.length >= 1, 'no friends');
  });

  let friendshipId;
  await test('GET /api/friends - get friendship id', async () => {
    const { data } = await req('GET', '/api/friends', null, {
      Authorization: `Bearer ${user1Token}`,
    });
    friendshipId = data.friends[0].id;
    assert(friendshipId, 'no friendship id');
  });

  await test('DELETE /api/friends/:id', async () => {
    const { status } = await req('DELETE', `/api/friends/${friendshipId}`, null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}`);
  });

  // BLOCKS
  let user3Id, user3Token;
  await test('POST /api/auth/register - user3 for block test', async () => {
    const { status, data } = await req('POST', '/api/auth/register', {
      username: U3,
      password: 'password123',
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    user3Id = data.user.id;
    user3Token = data.token;
  });

  await test('POST /api/friends/blocks - block user', async () => {
    const { status, data } = await req('POST', '/api/friends/blocks', {
      userId: user3Id,
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
  });

  await test('POST /api/friends/blocks - self blocked', async () => {
    const { status } = await req('POST', '/api/friends/blocks', {
      userId: user1Id,
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await test('POST /api/friends/blocks - duplicate blocked', async () => {
    const { status } = await req('POST', '/api/friends/blocks', {
      userId: user3Id,
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 409, `Expected 409, got ${status}`);
  });

  await test('GET /api/friends/blocks - list', async () => {
    const { status, data } = await req('GET', '/api/friends/blocks', null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert(data.blockedUsers.length >= 1, 'no blocked users');
  });

  await test('DELETE /api/friends/blocks/:userId', async () => {
    const { status } = await req('DELETE', `/api/friends/blocks/${user3Id}`, null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}`);
  });

  await test('GET /api/friends/blocks - empty after unblock', async () => {
    const { status, data } = await req('GET', '/api/friends/blocks', null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.blockedUsers.length === 0, 'still has blocked users');
  });

  // REJECT FLOW
  let user4Token, user4Username, requestId2;
  await test('POST /api/auth/register - user4 for reject test', async () => {
    const { status, data } = await req('POST', '/api/auth/register', {
      username: U4,
      password: 'password123',
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    user4Token = data.token;
    user4Username = `${data.user.username}#${data.user.discriminator}`;
  });

  await test('Send friend request to user4', async () => {
    const { status, data } = await req('POST', '/api/friends/request', {
      username: user4Username,
    }, { Authorization: `Bearer ${user1Token}` });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    requestId2 = data.requestId;
  });

  await test('PUT /api/friends/request/:id/reject', async () => {
    const { status, data } = await req('PUT', `/api/friends/request/${requestId2}/reject`, null, {
      Authorization: `Bearer ${user4Token}`,
    });
    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  });

  // Summary
  console.log('\n=== RESULTS ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
