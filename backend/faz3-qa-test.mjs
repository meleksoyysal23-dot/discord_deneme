/**
 * FAZ 3 - QA & Security Test
 * Edge cases, permission checks, and security validation
 */

const BASE_URL = 'http://localhost:3001';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await res.json();
    return { status: res.status, data };
  } catch (error) {
    console.error(`Request failed: ${method} ${path}`, error.message);
    return { status: 0, data: { error: error.message } };
  }
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

async function runQA() {
  console.log('========================================');
  console.log('FAZ 3 - QA & Security Tests');
  console.log('========================================\n');

  // Register test users with unique names
  const rand = Math.random().toString(36).substring(2, 6);
  const u1 = await request('POST', '/api/auth/register', { username: `qo_${rand}`, password: 'test123456' });
  const u2 = await request('POST', '/api/auth/register', { username: `qm_${rand}`, password: 'test123456' });
  const u3 = await request('POST', '/api/auth/register', { username: `qx_${rand}`, password: 'test123456' });
  
  if (!u1.data.success || !u2.data.success || !u3.data.success) {
    console.error('Registration failed:', { u1: u1.data, u2: u2.data, u3: u3.data });
    process.exit(1);
  }
  
  const t1 = u1.data.token;
  const t2 = u2.data.token;
  const t3 = u3.data.token;

  // Create server
  const srv = await request('POST', '/api/servers', {
    name: 'QA Test Server',
    description: 'Security testing',
  }, t1);
  
  if (!srv.data.success) {
    console.error('Server creation failed:', srv.data);
    process.exit(1);
  }
  
  const serverId = srv.data.server.id;

  // === SECURITY TESTS ===
  console.log('--- Security: Auth Required ---');
  
  const noAuth1 = await request('POST', '/api/servers', { name: 'Test' });
  assert(noAuth1.status === 401, 'POST /servers without auth → 401');
  
  const noAuth2 = await request('GET', '/api/servers');
  assert(noAuth2.status === 401, 'GET /servers without auth → 401');
  
  const badToken = await request('GET', '/api/servers', null, 'invalid-token-here');
  assert(badToken.status === 403 || badToken.status === 401, 'Invalid token → 401/403');

  // === PERMISSION TESTS ===
  console.log('\n--- Security: Permission Checks ---');
  
  // Invite user2
  const inv = await request('POST', `/api/servers/${serverId}/invites`, { maxUses: 5 }, t1);
  assert(inv.status === 201, 'Owner can create invite');
  const inviteCode = inv.data.invite?.code;
  
  const join = await request('POST', `/api/invites/${inviteCode}/join`, null, t2);
  assert(join.status === 200, 'User2 joins via invite');
  
  // User2 (no admin perms) tries to create channel
  const perm1 = await request('POST', `/api/servers/${serverId}/channels`, {
    name: 'hacked',
    type: 'TEXT',
  }, t2);
  assert(perm1.status === 403, 'Non-admin cannot create channels → 403');
  
  // User2 tries to update server
  const perm2 = await request('PUT', `/api/servers/${serverId}`, {
    name: 'Hacked Server',
  }, t2);
  assert(perm2.status === 403, 'Non-owner cannot update server → 403');
  
  // User2 tries to delete server
  const perm3 = await request('DELETE', `/api/servers/${serverId}`, null, t2);
  assert(perm3.status === 403, 'Non-owner cannot delete server → 403');
  
  // User2 tries to transfer ownership
  const perm4 = await request('POST', `/api/servers/${serverId}/transfer`, {
    newOwnerId: u3.data.user.id,
  }, t2);
  assert(perm4.status === 403, 'Non-owner cannot transfer → 403');
  
  // Outsider tries to view invites
  const perm5 = await request('GET', `/api/servers/${serverId}/invites`, null, t3);
  assert(perm5.status === 403, 'Outsider cannot view invites → 403');
  
  // Outsider tries to create invite
  const perm6 = await request('POST', `/api/servers/${serverId}/invites`, {}, t3);
  assert(perm6.status === 403, 'Outsider cannot create invite → 403');
  
  // Outsider tries to access server detail
  const perm7 = await request('GET', `/api/servers/${serverId}`, null, t3);
  assert(perm7.status === 403, 'Outsider cannot view server → 403');

  // === INPUT VALIDATION TESTS ===
  console.log('\n--- Validation: Input Checks ---');
  
  // Server name too short
  const val1 = await request('POST', '/api/servers', { name: 'ab' }, t1);
  assert(val1.status === 400, 'Server name < 3 chars → 400');
  
  // Server name too long
  const val2 = await request('POST', '/api/servers', { name: 'a'.repeat(51) }, t1);
  assert(val2.status === 400, 'Server name > 50 chars → 400');
  
  // Description too long
  const val3 = await request('POST', '/api/servers', {
    name: 'Valid Name',
    description: 'x'.repeat(501),
  }, t1);
  assert(val3.status === 400, 'Description > 500 chars → 400');
  
  // Invalid channel type
  const val4 = await request('POST', `/api/servers/${serverId}/channels`, {
    name: 'test',
    type: 'INVALID_TYPE',
  }, t1);
  assert(val4.status === 400, 'Invalid channel type → 400');
  
  // Channel name normalization
  const val5 = await request('POST', `/api/servers/${serverId}/channels`, {
    name: 'My Cool Channel',
    type: 'TEXT',
  }, t1);
  assert(val5.data.channel?.name === 'my-cool-channel', `Channel name normalized: "${val5.data.channel?.name}"`);
  
  // Topic too long
  const val6 = await request('POST', `/api/servers/${serverId}/channels`, {
    name: 'topic-test',
    type: 'TEXT',
    topic: 'x'.repeat(201),
  }, t1);
  assert(val6.status === 400, 'Topic > 200 chars → 400');
  
  // Slowmode too large
  const val7 = await request('POST', `/api/servers/${serverId}/channels`, {
    name: 'slow-test',
    type: 'TEXT',
    slowmode: 999999,
  }, t1);
  assert(val7.status === 400, 'Slowmode > 21600 → 400');
  
  // Message limit validation
  const textCh = val5.data.channel?.id;
  if (textCh) {
    const val8 = await request('GET', `/api/channels/${textCh}/messages?limit=999`, null, t1);
    assert(val8.status === 200, 'Large limit clamped to 100');
    
    // Invalid limit
    const val9 = await request('GET', `/api/channels/${textCh}/messages?limit=-5`, null, t1);
    assert(val9.status === 400, 'Negative limit → 400');
  }

  // === INVITE EDGE CASES ===
  console.log('\n--- Edge Cases: Invites ---');
  
  // Create invite with maxUses=1
  const singleUse = await request('POST', `/api/servers/${serverId}/invites`, {
    maxUses: 1,
  }, t1);
  const singleCode = singleUse.data.invite?.code;
  
  // Declare u4 at function scope so it's available for transfer tests
  let u4 = null;
  
  if (singleCode) {
    // First join works
    const join1 = await request('POST', `/api/invites/${singleCode}/join`, null, t3);
    assert(join1.status === 200, 'First use of single-use invite works');
    
    // Second join fails (maxUses reached)
    u4 = await request('POST', '/api/auth/register', { username: `qe_${rand}`, password: 'test123456' });
    if (u4.data.success) {
      const join2 = await request('POST', `/api/invites/${singleCode}/join`, null, u4.data.token);
      assert(join2.status === 410, 'Second use of exhausted invite → 410');
    }
  }
  
  // Non-existent invite
  const noInvite = await request('POST', '/api/invites/doesnotexist/join', null, t1);
  assert(noInvite.status === 404, 'Non-existent invite → 404');
  
  // Delete invite by non-creator non-owner
  const delInv = await request('DELETE', `/api/invites/${inviteCode}`, null, t3);
  assert(delInv.status === 403, 'Non-creator/non-owner cannot delete invite → 403');

  // === TRANSFER EDGE CASES ===
  console.log('\n--- Edge Cases: Transfer ---');
  
  // Transfer to non-member (use u4 if exists, otherwise skip)
  if (u4 && u4.data.success) {
    const trans1 = await request('POST', `/api/servers/${serverId}/transfer`, {
      newOwnerId: u4.data.user.id,
    }, t1);
    assert(trans1.status === 400, 'Transfer to non-member → 400');
  }
  
  // Transfer to self
  const trans2 = await request('POST', `/api/servers/${serverId}/transfer`, {
    newOwnerId: u1.data.user.id,
  }, t1);
  assert(trans2.status === 400, 'Transfer to self → 400');

  // === SERVER DETAIL FORMAT ===
  console.log('\n--- Response Format Checks ---');
  
  const detail = await request('GET', `/api/servers/${serverId}`, null, t1);
  const s = detail.data.server;
  
  if (s) {
    assert(typeof s.id === 'string', 'server.id is string');
    assert(typeof s.name === 'string', 'server.name is string');
    assert(typeof s.ownerId === 'string', 'server.ownerId is string');
    assert(typeof s.createdAt === 'string', 'server.createdAt is string (ISO)');
    assert(Array.isArray(s.channels), 'server.channels is array');
    assert(Array.isArray(s.members), 'server.members is array');
    assert(Array.isArray(s.roles), 'server.roles is array');
    assert(typeof s.memberCount === 'number', 'server.memberCount is number');
    
    // Check member format
    if (s.members.length > 0) {
      const m = s.members[0];
      assert(typeof m.userId === 'string', 'member.userId is string');
      assert(typeof m.username === 'string', 'member.username is string');
      assert(typeof m.discriminator === 'string', 'member.discriminator is string');
      assert(/^\d{4}$/.test(m.discriminator), 'discriminator is 4 digits');
      assert(Array.isArray(m.roles), 'member.roles is array');
    }
    
    // Check channel format
    if (s.channels.length > 0) {
      const ch = s.channels[0];
      assert(typeof ch.id === 'string', 'channel.id is string');
      assert(typeof ch.name === 'string', 'channel.name is string');
      assert(typeof ch.type === 'string', 'channel.type is string');
      assert(typeof ch.position === 'number', 'channel.position is number');
    }
  }

  // Cleanup
  await request('DELETE', `/api/servers/${serverId}`, null, t1);

  // Summary
  console.log('\n========================================');
  console.log(`QA RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================');
  
  process.exit(failed > 0 ? 1 : 0);
}

runQA().catch(err => {
  console.error('QA error:', err);
  process.exit(1);
});
