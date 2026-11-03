/**
 * FAZ 4 Runtime Test Script
 * Tests all message endpoints with real HTTP requests
 */

import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3001';

async function test() {
  console.log('🧪 FAZ 4 Runtime Test Starting...\n');

  // 1. Create test user
  console.log('1️⃣  Creating test user...');
  const uniqueDiscriminator = String(Math.floor(Math.random() * 9000) + 1000);
  const user = await prisma.user.create({
    data: {
      username: `faz4test_${Date.now()}`,
      discriminator: uniqueDiscriminator,
      passwordHash: 'test',
    },
  });
  console.log(`✅ User created: ${user.id} (discriminator: ${uniqueDiscriminator})\n`);

  // 2. Generate JWT token
  console.log('2️⃣  Generating JWT token...');
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  console.log(`✅ Token generated\n`);

  // 3. Create test server
  console.log('3️⃣  Creating test server...');
  const server = await prisma.server.create({
    data: {
      name: `FAZ4 Test Server ${Date.now()}`,
      ownerId: user.id,
    },
  });
  console.log(`✅ Server created: ${server.id}\n`);

  // 4. Add user as member with SEND_MESSAGES permission
  console.log('4️⃣  Adding user as server member...');
  const member = await prisma.serverMember.create({
    data: {
      serverId: server.id,
      userId: user.id,
    },
  });
  const role = await prisma.role.create({
    data: {
      serverId: server.id,
      name: 'Test Role',
      permissions: '128', // SEND_MESSAGES
    },
  });
  await prisma.userRole.create({
    data: {
      memberId: member.id,
      roleId: role.id,
    },
  });
  console.log(`✅ Member added with SEND_MESSAGES permission\n`);

  // 5. Create test channel
  console.log('5️⃣  Creating test channel...');
  const channel = await prisma.channel.create({
    data: {
      serverId: server.id,
      name: 'test-channel',
      type: 'TEXT',
    },
  });
  console.log(`✅ Channel created: ${channel.id}\n`);

  // 6. Test POST /api/channels/:id/messages
  console.log('6️⃣  Testing POST /api/channels/:id/messages...');
  const createRes = await fetch(`${BASE_URL}/api/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content: 'Test message content' }),
  });
  const createData = await createRes.json();
  console.log(`Status: ${createRes.status}`);
  console.log(`Response:`, createData);
  if (!createData.success) throw new Error('Message creation failed');
  const messageId = createData.message.id;
  console.log(`✅ Message created: ${messageId}\n`);

  // 7. Test PUT /api/messages/:id (edit)
  console.log('7️⃣  Testing PUT /api/messages/:id (edit)...');
  const editRes = await fetch(`${BASE_URL}/api/messages/${messageId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content: 'Edited message content' }),
  });
  const editData = await editRes.json();
  console.log(`Status: ${editRes.status}`);
  console.log(`Response:`, editData);
  if (!editData.success) throw new Error('Message edit failed');
  console.log(`✅ Message edited\n`);

  // 8. Test POST /api/messages/:id/reactions
  console.log('8️⃣  Testing POST /api/messages/:id/reactions...');
  const reactionRes = await fetch(`${BASE_URL}/api/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ emoji: '👍' }),
  });
  const reactionData = await reactionRes.json();
  console.log(`Status: ${reactionRes.status}`);
  console.log(`Response:`, reactionData);
  if (!reactionData.success) throw new Error('Reaction add failed');
  console.log(`✅ Reaction added\n`);

  // 9. Test GET /api/messages/:id/reactions
  console.log('9️⃣  Testing GET /api/messages/:id/reactions...');
  const getReactionsRes = await fetch(`${BASE_URL}/api/messages/${messageId}/reactions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getReactionsData = await getReactionsRes.json();
  console.log(`Status: ${getReactionsRes.status}`);
  console.log(`Response:`, getReactionsData);
  if (!getReactionsData.reactions || getReactionsData.reactions.length === 0) {
    throw new Error('Reactions fetch failed');
  }
  console.log(`✅ Reactions fetched\n`);

  // 10. Test PUT /api/messages/:id/pin
  console.log('🔟 Testing PUT /api/messages/:id/pin...');
  const pinRes = await fetch(`${BASE_URL}/api/messages/${messageId}/pin`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  const pinData = await pinRes.json();
  console.log(`Status: ${pinRes.status}`);
  console.log(`Response:`, pinData);
  // Pin requires MANAGE_MESSAGES permission, so this should fail with 403
  console.log(`✅ Pin test completed (expected 403 for non-admin)\n`);

  // 11. Test GET /api/channels/:id/pins
  console.log('1️⃣1️⃣ Testing GET /api/channels/:id/pins...');
  const pinsRes = await fetch(`${BASE_URL}/api/channels/${channel.id}/pins`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pinsData = await pinsRes.json();
  console.log(`Status: ${pinsRes.status}`);
  console.log(`Response:`, pinsData);
  console.log(`✅ Pins fetched\n`);

  // 12. Test DELETE /api/messages/:id/reactions/:emoji
  console.log('1️⃣2️⃣ Testing DELETE /api/messages/:id/reactions/:emoji...');
  const deleteReactionRes = await fetch(
    `${BASE_URL}/api/messages/${messageId}/reactions/${encodeURIComponent('👍')}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const deleteReactionData = await deleteReactionRes.json();
  console.log(`Status: ${deleteReactionRes.status}`);
  console.log(`Response:`, deleteReactionData);
  if (!deleteReactionData.success) throw new Error('Reaction delete failed');
  console.log(`✅ Reaction removed\n`);

  // 13. Test DELETE /api/messages/:id
  console.log('1️⃣3️⃣ Testing DELETE /api/messages/:id...');
  const deleteRes = await fetch(`${BASE_URL}/api/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const deleteData = await deleteRes.json();
  console.log(`Status: ${deleteRes.status}`);
  console.log(`Response:`, deleteData);
  if (!deleteData.success) throw new Error('Message delete failed');
  console.log(`✅ Message deleted\n`);

  // 14. Test validation: empty content
  console.log('1️⃣4️⃣ Testing validation: empty content...');
  const emptyRes = await fetch(`${BASE_URL}/api/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content: '' }),
  });
  const emptyData = await emptyRes.json();
  console.log(`Status: ${emptyRes.status}`);
  console.log(`Response:`, emptyData);
  if (emptyRes.status !== 400) throw new Error('Empty content validation failed');
  console.log(`✅ Validation working\n`);

  // 15. Test validation: content too long
  console.log('1️⃣5️⃣ Testing validation: content too long...');
  const longRes = await fetch(`${BASE_URL}/api/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content: 'a'.repeat(2001) }),
  });
  const longData = await longRes.json();
  console.log(`Status: ${longRes.status}`);
  console.log(`Response:`, longData);
  if (longRes.status !== 400) throw new Error('Long content validation failed');
  console.log(`✅ Validation working\n`);

  // 16. Test unauthorized access
  console.log('1️⃣6️⃣ Testing unauthorized access...');
  const unauthRes = await fetch(`${BASE_URL}/api/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Test' }),
  });
  console.log(`Status: ${unauthRes.status}`);
  if (unauthRes.status !== 401) throw new Error('Unauthorized access test failed');
  console.log(`✅ Auth protection working\n`);

  console.log('✅ ALL TESTS PASSED!\n');

  // Cleanup
  console.log('🧹 Cleaning up test data...');
  await prisma.message.deleteMany({ where: { channelId: channel.id } });
  await prisma.reaction.deleteMany({ where: { message: { channelId: channel.id } } });
  await prisma.channel.delete({ where: { id: channel.id } });
  await prisma.serverMember.delete({ where: { id: member.id } });
  await prisma.userRole.deleteMany({ where: { memberId: member.id } });
  await prisma.role.delete({ where: { id: role.id } });
  await prisma.server.delete({ where: { id: server.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log('✅ Cleanup complete\n');
}

test()
  .catch((error) => {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
