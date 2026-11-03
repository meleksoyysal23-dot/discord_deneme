/**
 * FAZ 3 - Server, Channel, Invite System Test
 * Full end-to-end test
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

async function registerUser(username) {
  const res = await request('POST', '/api/auth/register', {
    username,
    password: 'test123456',
  });
  console.log(`Register ${username}: status=${res.status}, success=${res.data.success}`);
  return res.data;
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

async function runTests() {
  console.log('========================================');
  console.log('FAZ 3 - Server, Channel, Invite Tests');
  console.log('========================================\n');

  // 1. Register two users (use short random suffix to ensure uniqueness, max 20 chars)
  console.log('--- 1. User Registration ---');
  const rand = Math.random().toString(36).substring(2, 8);
  const user1 = await registerUser(`u1_${rand}`);
  assert(user1.success === true, `User1 registered: ${user1.user?.username}`);
  
  const user2 = await registerUser(`u2_${rand}`);
  assert(user2.success === true, `User2 registered: ${user2.user?.username}`);

  if (!user1.success || !user2.success) {
    console.error('Registration failed, cannot continue tests');
    process.exit(1);
  }

  const token1 = user1.token;
  const token2 = user2.token;

  // 2. Create server
  console.log('\n--- 2. Server Creation ---');
  const createRes = await request('POST', '/api/servers', {
    name: 'Test Server',
    description: 'A test server for FAZ 3',
    icon: '🎮',
  }, token1);
  
  assert(createRes.status === 201, `Server created (status ${createRes.status})`);
  assert(createRes.data.success === true, 'Server creation success=true');
  assert(createRes.data.server?.channels?.length === 2, `Default channels created: ${createRes.data.server?.channels?.length}`);
  assert(createRes.data.server?.channels?.[0]?.name === 'general', 'First channel is "general"');
  assert(createRes.data.server?.channels?.[1]?.name === 'Voice Chat', 'Second channel is "Voice Chat"');
  assert(createRes.data.server?.roles?.length >= 1, `Default role created: ${createRes.data.server?.roles?.length}`);
  assert(createRes.data.server?.roles?.[0]?.name === '@everyone', '@everyone role exists');
  assert(createRes.data.server?.members?.length === 1, 'Owner is the only member');
  
  const serverId = createRes.data.server?.id;
  if (!serverId) {
    console.error('Server creation failed, cannot continue tests');
    process.exit(1);
  }
  console.log(`  Server ID: ${serverId}`);

  // 3. Get servers list
  console.log('\n--- 3. Get Servers List ---');
  const listRes = await request('GET', '/api/servers', null, token1);
  assert(listRes.status === 200, `Servers list fetched (status ${listRes.status})`);
  assert(listRes.data.servers?.length >= 1, `User has ${listRes.data.servers?.length} server(s)`);
  assert(listRes.data.servers?.[0]?.memberCount === 1, `Member count: ${listRes.data.servers?.[0]?.memberCount}`);

  // 4. Get server detail
  console.log('\n--- 4. Get Server Detail ---');
  const detailRes = await request('GET', `/api/servers/${serverId}`, null, token1);
  assert(detailRes.status === 200, `Server detail fetched (status ${detailRes.status})`);
  assert(detailRes.data.server?.name === 'Test Server', 'Server name matches');
  assert(detailRes.data.server?.channels?.length === 2, 'Channels count matches');
  assert(detailRes.data.server?.members?.length === 1, 'Members count matches');

  // 5. Non-member cannot access
  console.log('\n--- 5. Access Control ---');
  const nonMemberRes = await request('GET', `/api/servers/${serverId}`, null, token2);
  assert(nonMemberRes.status === 403, `Non-member gets 403 (got ${nonMemberRes.status})`);

  // 6. Update server (owner only)
  console.log('\n--- 6. Update Server ---');
  const updateRes = await request('PUT', `/api/servers/${serverId}`, {
    name: 'Updated Server',
    description: 'Updated description',
  }, token1);
  assert(updateRes.status === 200, `Server updated (status ${updateRes.status})`);
  assert(updateRes.data.server?.name === 'Updated Server', 'Name updated');

  // Non-owner cannot update
  const nonOwnerUpdate = await request('PUT', `/api/servers/${serverId}`, {
    name: 'Hacked',
  }, token2);
  assert(nonOwnerUpdate.status === 403, `Non-owner update rejected (got ${nonOwnerUpdate.status})`);

  // 7. Create invite
  console.log('\n--- 7. Invite System ---');
  const inviteRes = await request('POST', `/api/servers/${serverId}/invites`, {
    maxAge: 86400,
    maxUses: 10,
  }, token1);
  assert(inviteRes.status === 201, `Invite created (status ${inviteRes.status})`);
  assert(inviteRes.data.invite?.code?.length === 8, `Invite code: ${inviteRes.data.invite?.code}`);
  assert(inviteRes.data.invite?.maxUses === 10, 'maxUses is 10');
  assert(inviteRes.data.invite?.expiresAt !== null, 'expiresAt is set');
  
  const inviteCode = inviteRes.data.invite?.code;
  if (!inviteCode) {
    console.error('Invite creation failed');
  }

  // 8. List invites
  const listInvitesRes = await request('GET', `/api/servers/${serverId}/invites`, null, token1);
  assert(listInvitesRes.status === 200, `Invites listed (status ${listInvitesRes.status})`);
  assert(listInvitesRes.data.invites?.length >= 1, `${listInvitesRes.data.invites?.length} invite(s) found`);

  // 9. Join via invite
  console.log('\n--- 8. Join via Invite ---');
  const joinRes = await request('POST', `/api/invites/${inviteCode}/join`, null, token2);
  assert(joinRes.status === 200, `User2 joined server (status ${joinRes.status})`);
  assert(joinRes.data.success === true, 'Join success=true');
  assert(joinRes.data.server?.memberCount === 2, `Member count now: ${joinRes.data.server?.memberCount}`);

  // 10. Already member check
  const doubleJoinRes = await request('POST', `/api/invites/${inviteCode}/join`, null, token2);
  assert(doubleJoinRes.status === 409, `Double join rejected (got ${doubleJoinRes.status})`);

  // 11. Verify user2 is now a member
  const detailAfterJoin = await request('GET', `/api/servers/${serverId}`, null, token2);
  assert(detailAfterJoin.status === 200, `User2 can now access server (status ${detailAfterJoin.status})`);
  assert(detailAfterJoin.data.server?.members?.length === 2, `Members count: ${detailAfterJoin.data.server?.members?.length}`);

  // 12. Create channel (admin)
  console.log('\n--- 9. Channel Management ---');
  const channelRes = await request('POST', `/api/servers/${serverId}/channels`, {
    name: 'Announcements',
    type: 'ANNOUNCEMENT',
    topic: 'Important announcements',
  }, token1);
  assert(channelRes.status === 201, `Channel created (status ${channelRes.status})`);
  assert(channelRes.data.channel?.name === 'announcements', `Channel name normalized: ${channelRes.data.channel?.name}`);
  assert(channelRes.data.channel?.type === 'ANNOUNCEMENT', 'Channel type is ANNOUNCEMENT');
  
  const channelId = channelRes.data.channel?.id;

  // 13. Update channel
  if (channelId) {
    const updateChannelRes = await request('PUT', `/api/channels/${channelId}`, {
      topic: 'Updated topic',
      nsfw: false,
    }, token1);
    assert(updateChannelRes.status === 200, `Channel updated (status ${updateChannelRes.status})`);
    assert(updateChannelRes.data.channel?.topic === 'Updated topic', 'Topic updated');
  }

  // 14. Get messages (empty)
  console.log('\n--- 10. Messages ---');
  if (channelId) {
    const messagesRes = await request('GET', `/api/channels/${channelId}/messages?limit=50`, null, token1);
    assert(messagesRes.status === 200, `Messages fetched (status ${messagesRes.status})`);
    assert(messagesRes.data.messages?.length === 0, 'No messages yet (empty channel)');
  }

  // 15. Non-admin cannot create channels
  const nonAdminChannel = await request('POST', `/api/servers/${serverId}/channels`, {
    name: 'hacked-channel',
    type: 'TEXT',
  }, token2);
  assert(nonAdminChannel.status === 403, `Non-admin channel creation rejected (got ${nonAdminChannel.status})`);

  // 16. Delete channel
  if (channelId) {
    const deleteChannelRes = await request('DELETE', `/api/channels/${channelId}`, null, token1);
    assert(deleteChannelRes.status === 200, `Channel deleted (status ${deleteChannelRes.status})`);
  }

  // 17. Delete invite
  console.log('\n--- 11. Delete Invite ---');
  if (inviteCode) {
    const deleteInviteRes = await request('DELETE', `/api/invites/${inviteCode}`, null, token1);
    assert(deleteInviteRes.status === 200, `Invite deleted (status ${deleteInviteRes.status})`);
  }

  // 18. Transfer ownership
  console.log('\n--- 12. Transfer Ownership ---');
  const membersAfterJoin = detailAfterJoin.data.server?.members || [];
  const user2Id = membersAfterJoin.find(m => m.username === user2.user?.username)?.userId;
  
  if (user2Id) {
    const transferRes = await request('POST', `/api/servers/${serverId}/transfer`, {
      newOwnerId: user2Id,
    }, token1);
    assert(transferRes.status === 200, `Ownership transferred (status ${transferRes.status})`);
    
    // Verify new owner
    const afterTransfer = await request('GET', `/api/servers/${serverId}`, null, token2);
    assert(afterTransfer.data.server?.ownerId === user2Id, 'New owner is user2');
    
    // Old owner cannot delete anymore
    const oldOwnerDelete = await request('DELETE', `/api/servers/${serverId}`, null, token1);
    assert(oldOwnerDelete.status === 403, `Old owner cannot delete (got ${oldOwnerDelete.status})`);
    
    // New owner can delete
    const newOwnerDelete = await request('DELETE', `/api/servers/${serverId}`, null, token2);
    assert(newOwnerDelete.status === 200, `New owner can delete (status ${newOwnerDelete.status})`);
  } else {
    console.log('  ⚠️ Could not find user2 ID for transfer test');
    // Cleanup
    await request('DELETE', `/api/servers/${serverId}`, null, token1);
  }

  // 19. Validation tests
  console.log('\n--- 13. Validation Tests ---');
  
  // Server name too short
  const shortName = await request('POST', '/api/servers', { name: 'ab' }, token1);
  assert(shortName.status === 400, `Short name rejected (got ${shortName.status})`);
  
  // No auth
  const noAuth = await request('GET', '/api/servers');
  assert(noAuth.status === 401, `No auth rejected (got ${noAuth.status})`);

  // Invalid channel type
  const invalidType = await request('POST', '/api/servers', { name: 'Valid Server' }, token1);
  if (invalidType.data.server) {
    const badChannel = await request('POST', `/api/servers/${invalidType.data.server.id}/channels`, {
      name: 'test',
      type: 'INVALID',
    }, token1);
    assert(badChannel.status === 400, `Invalid channel type rejected (got ${badChannel.status})`);
    
    // Cleanup
    await request('DELETE', `/api/servers/${invalidType.data.server.id}`, null, token1);
  }

  // Summary
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================');
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
