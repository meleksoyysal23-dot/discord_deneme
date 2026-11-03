/**
 * FAZ 4 Integration Test
 * Uses Node.js native fetch (Node 18+)
 */

const BASE = 'http://localhost:3001';

async function request(method, path, { body, token } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let reqBody;
  if (body) {
    headers['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: reqBody,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function check(label, actual, expected) {
  const pass = actual === expected;
  console.log(`   ${pass ? '✅' : '❌'} ${label}: ${actual} (expected ${expected})`);
  return pass;
}

async function runTests() {
  console.log('=== FAZ 4 INTEGRATION TEST ===\n');
  let passed = 0;
  let failed = 0;

  function track(label, actual, expected) {
    if (check(label, actual, expected)) passed++;
    else failed++;
  }

  // 1. Register two users
  console.log('1. Creating test users...');
  const ts = Date.now();
  const u1name = `phase4user1_${ts}`;
  const u2name = `phase4user2_${ts}`;

  const user1 = await request('POST', '/api/auth/register', {
    body: { username: u1name, password: 'Test1234!', discriminator: '2001' },
  });
  const user2 = await request('POST', '/api/auth/register', {
    body: { username: u2name, password: 'Test1234!', discriminator: '2002' },
  });
  track('User1 register', user1.status, 201);
  track('User2 register', user2.status, 201);

  // 2. Login
  console.log('\n2. Logging in...');
  const login1 = await request('POST', '/api/auth/login', {
    body: { username: u1name, password: 'Test1234!' },
  });
  const login2 = await request('POST', '/api/auth/login', {
    body: { username: u2name, password: 'Test1234!' },
  });
  const token1 = login1.data?.token;
  const token2 = login2.data?.token;
  track('User1 login', !!token1, true);
  track('User2 login', !!token2, true);

  if (!token1 || !token2) {
    console.log('   ❌ Login failed, aborting');
    return;
  }

  // 3. Create a server
  console.log('\n3. Creating test server...');
  const serverRes = await request('POST', '/api/servers', {
    body: { name: 'Phase4 Test Server' },
    token: token1,
  });
  track('Server create', serverRes.status, 201);
  const serverId = serverRes.data?.server?.id;

  if (!serverId) {
    console.log('   ❌ No server ID, aborting');
    return;
  }

  // 4. User2 joins server via invite
  console.log('\n4. Creating invite and joining user2...');
  const inviteRes = await request('POST', `/api/servers/${serverId}/invites`, {
    token: token1,
  });
  track('Invite create', inviteRes.status, 201);

  if (inviteRes.status === 201) {
    const inviteCode = inviteRes.data.invite.code;
    const joinRes = await request('POST', `/api/invites/${inviteCode}/join`, {
      token: token2,
    });
    track('User2 join', joinRes.status, 200);
  }

  // 5. Create a channel
  console.log('\n5. Creating text channel...');
  const channelRes = await request('POST', `/api/servers/${serverId}/channels`, {
    body: { name: 'general', type: 'TEXT' },
    token: token1,
  });
  track('Channel create', channelRes.status, 201);
  const channelId = channelRes.data?.channel?.id;

  if (!channelId) {
    console.log('   ❌ No channel ID, aborting');
    return;
  }

  // 6. Send a message (user1)
  console.log('\n6. Sending message...');
  const msgRes = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: 'Hello world! **bold** and _italic_' },
    token: token1,
  });
  track('Message create', msgRes.status, 201);
  const messageId = msgRes.data?.message?.id;
  console.log(`   Content: "${msgRes.data?.message?.content}"`);
  console.log(`   Author: ${msgRes.data?.message?.author?.username}`);

  if (!messageId) {
    console.log('   ❌ No message ID, aborting');
    return;
  }

  // 7. Test content validation - too long
  console.log('\n7. Testing content validation (too long)...');
  const longMsg = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: 'x'.repeat(2001) },
    token: token1,
  });
  track('Too-long message', longMsg.status, 400);

  // 8. Test empty content
  console.log('\n8. Testing empty content...');
  const emptyMsg = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: '' },
    token: token1,
  });
  track('Empty message', emptyMsg.status, 400);

  // 9. Edit message (user1 - author)
  console.log('\n9. Editing message (author)...');
  const editRes = await request('PUT', `/api/messages/${messageId}`, {
    body: { content: 'Edited: Hello world!' },
    token: token1,
  });
  track('Edit by author', editRes.status, 200);
  console.log(`   editedAt: ${editRes.data?.message?.editedAt}`);
  track('editedAt set', !!editRes.data?.message?.editedAt, true);

  // 10. Edit message (user2 - NOT author) - should fail
  console.log('\n10. Editing message (non-author)...');
  const editFail = await request('PUT', `/api/messages/${messageId}`, {
    body: { content: 'Hacked!' },
    token: token2,
  });
  track('Non-author edit', editFail.status, 403);

  // 11. Add reaction (user1)
  console.log('\n11. Adding reaction...');
  const reactRes = await request('POST', `/api/messages/${messageId}/reactions`, {
    body: { emoji: '👍' },
    token: token1,
  });
  track('Reaction add', reactRes.status, 201);

  // 12. Add same reaction again - should fail (unique)
  console.log('\n12. Duplicate reaction...');
  const reactDup = await request('POST', `/api/messages/${messageId}/reactions`, {
    body: { emoji: '👍' },
    token: token1,
  });
  track('Duplicate reaction', reactDup.status, 409);

  // 13. Add different reaction (user2)
  console.log('\n13. Different reaction by user2...');
  const react2 = await request('POST', `/api/messages/${messageId}/reactions`, {
    body: { emoji: '❤️' },
    token: token2,
  });
  track('User2 reaction', react2.status, 201);

  // 14. Get reactions
  console.log('\n14. Getting reactions...');
  const reactionsRes = await request('GET', `/api/messages/${messageId}/reactions`, {
    token: token1,
  });
  track('Get reactions', reactionsRes.status, 200);
  const reactions = reactionsRes.data?.reactions || [];
  console.log(`   Reaction groups: ${reactions.length}`);
  for (const r of reactions) {
    console.log(`     ${r.emoji}: ${r.count} users`);
  }
  track('Reaction groups count', reactions.length, 2);

  // 15. Remove reaction
  console.log('\n15. Removing reaction...');
  const removeReact = await request('DELETE', `/api/messages/${messageId}/reactions/${encodeURIComponent('❤️')}`, {
    token: token2,
  });
  track('Remove reaction', removeReact.status, 200);

  // 16. Pin message (admin/owner)
  console.log('\n16. Pinning message...');
  const pinRes = await request('PUT', `/api/messages/${messageId}/pin`, {
    token: token1,
  });
  track('Pin by owner', pinRes.status, 200);
  track('pinned=true', pinRes.data?.message?.pinned, true);

  // 17. Pin by non-admin - should fail
  console.log('\n17. Pin by non-admin...');
  const pinFail = await request('PUT', `/api/messages/${messageId}/pin`, {
    token: token2,
  });
  track('Non-admin pin', pinFail.status, 403);

  // 18. Get pinned messages
  console.log('\n18. Getting pinned messages...');
  const pinsRes = await request('GET', `/api/channels/${channelId}/pins`, {
    token: token1,
  });
  track('Get pins', pinsRes.status, 200);
  track('Pinned count', pinsRes.data?.messages?.length, 1);

  // 19. Unpin message
  console.log('\n19. Unpinning message...');
  const unpinRes = await request('DELETE', `/api/messages/${messageId}/pin`, {
    token: token1,
  });
  track('Unpin', unpinRes.status, 200);

  // 20. Reply to message (user2)
  console.log('\n20. Replying to message...');
  const replyRes = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: 'This is a reply!', replyTo: messageId },
    token: token2,
  });
  track('Reply create', replyRes.status, 201);
  console.log(`   replyTo.id: ${replyRes.data?.message?.replyTo?.id}`);
  track('replyTo populated', !!replyRes.data?.message?.replyTo?.id, true);

  // 21. @mention test
  console.log('\n21. Testing @mention...');
  const mentionRes = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: `Hey @${u2name}#2002 check this out!` },
    token: token1,
  });
  track('Mention message', mentionRes.status, 201);
  console.log(`   Content: "${mentionRes.data?.message?.content}"`);

  // 22. XSS sanitization test
  console.log('\n22. Testing XSS sanitization...');
  const xssRes = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: 'Hello <script>alert("xss")</script> world' },
    token: token1,
  });
  track('XSS message', xssRes.status, 201);
  const xssContent = xssRes.data?.message?.content || '';
  console.log(`   Sanitized: "${xssContent}"`);
  track('Script tag stripped', xssContent.includes('<script>'), false);

  // 23. Delete message (non-author, non-admin) - should fail
  console.log('\n23. Delete by non-author/non-admin...');
  const delFail = await request('DELETE', `/api/messages/${messageId}`, {
    token: token2,
  });
  track('Non-author delete', delFail.status, 403);

  // 24. Delete own message (user1 - author)
  console.log('\n24. Deleting own message...');
  const delRes = await request('DELETE', `/api/messages/${messageId}`, {
    token: token1,
  });
  track('Delete by author', delRes.status, 200);

  // 25. Verify message deleted
  console.log('\n25. Verifying deletion...');
  const verify = await request('GET', `/api/channels/${channelId}/messages`, {
    token: token1,
  });
  track('Get messages', verify.status, 200);
  const remainingIds = verify.data?.messages?.map(m => m.id) || [];
  track('Deleted message gone', remainingIds.includes(messageId), false);

  // 26. Slowmode test
  console.log('\n26. Testing slowmode...');
  const slowmodeRes = await request('PUT', `/api/channels/${channelId}`, {
    body: { slowmode: 30 },
    token: token1,
  });
  track('Set slowmode', slowmodeRes.status, 200);

  // Send first message (should work)
  const slowMsg1 = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: 'First message in slowmode' },
    token: token2,
  });
  track('First slowmode msg', slowMsg1.status, 201);

  // Send second message immediately (should fail with 429)
  const slowMsg2 = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: 'Second message too fast' },
    token: token2,
  });
  track('Second slowmode msg', slowMsg2.status, 429);
  console.log(`   Error: ${slowMsg2.data?.error}`);
  console.log(`   retryAfter: ${slowMsg2.data?.retryAfter}`);

  // Admin should be exempt
  const slowMsg3 = await request('POST', `/api/channels/${channelId}/messages`, {
    body: { content: 'Admin bypasses slowmode' },
    token: token1,
  });
  track('Admin bypass slowmode', slowMsg3.status, 201);

  // 27. Non-member cannot send messages
  console.log('\n27. Non-member test...');
  // Create a third user who is NOT in the server
  const u3name = `phase4user3_${ts}`;
  await request('POST', '/api/auth/register', {
    body: { username: u3name, password: 'Test1234!', discriminator: '2003' },
  });
  const login3 = await request('POST', '/api/auth/login', {
    body: { username: u3name, password: 'Test1234!' },
  });
  const token3 = login3.data?.token;
  if (token3) {
    const nonMember = await request('POST', `/api/channels/${channelId}/messages`, {
      body: { content: 'I am not a member' },
      token: token3,
    });
    track('Non-member send', nonMember.status, 403);
  }

  console.log('\n===========================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
