import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function verify() {
  console.log('=== DATABASE VERIFICATION ===\n');

  // 1. Table counts
  const [users, servers, channels, messages, members, friendships, friendReqs, blocks, roles, userRoles, reactions, attachments, replies, invites] = await Promise.all([
    prisma.user.count(),
    prisma.server.count(),
    prisma.channel.count(),
    prisma.message.count(),
    prisma.serverMember.count(),
    prisma.friendship.count(),
    prisma.friendRequest.count(),
    prisma.block.count(),
    prisma.role.count(),
    prisma.userRole.count(),
    prisma.reaction.count(),
    prisma.attachment.count(),
    prisma.messageReply.count(),
    prisma.invite.count(),
  ]);

  console.log('DATA COUNTS:');
  console.log(`  users:           ${users}`);
  console.log(`  servers:         ${servers}`);
  console.log(`  channels:        ${channels}`);
  console.log(`  messages:        ${messages}`);
  console.log(`  server_members:  ${members}`);
  console.log(`  friendships:     ${friendships}`);
  console.log(`  friend_requests: ${friendReqs}`);
  console.log(`  blocks:          ${blocks}`);
  console.log(`  roles:           ${roles}`);
  console.log(`  user_roles:      ${userRoles}`);
  console.log(`  reactions:       ${reactions}`);
  console.log(`  attachments:     ${attachments}`);
  console.log(`  message_replies: ${replies}`);
  console.log(`  invites:         ${invites}`);

  // 2. Expected values check
  const expected = {
    users: 3,
    servers: 1,
    channels: 2,
    messages: 3,
    server_members: 3,
    friendships: 1,
  };

  console.log('\nEXPECTED VALUES CHECK:');
  let allMatch = true;
  for (const [key, val] of Object.entries(expected)) {
    const actual = key === 'users' ? users : key === 'servers' ? servers : key === 'channels' ? channels : key === 'messages' ? messages : key === 'server_members' ? members : friendships;
    const match = actual === val;
    console.log(`  ${key}: expected=${val}, actual=${actual} ${match ? 'OK' : 'MISMATCH'}`);
    if (!match) allMatch = false;
  }

  // 3. User details
  console.log('\nUSERS:');
  const userList = await prisma.user.findMany({
    select: { username: true, discriminator: true, displayName: true, status: true }
  });
  userList.forEach(u => console.log(`  ${u.username}#${u.discriminator} | ${u.displayName} | ${u.status}`));

  // 4. Password verification
  console.log('\nPASSWORD VERIFICATION:');
  const u1 = await prisma.user.findUnique({ where: { username: 'testuser1' } });
  const match1 = await bcrypt.compare('password123', u1.passwordHash);
  console.log(`  testuser1 password123 -> ${match1 ? 'MATCH' : 'FAIL'}`);

  // 5. Relational integrity
  console.log('\nRELATIONAL INTEGRITY:');
  const serverWithRelations = await prisma.server.findFirst({
    include: { owner: true, members: { include: { user: true } }, channels: true }
  });
  console.log(`  Server "${serverWithRelations.name}" owned by ${serverWithRelations.owner.username}`);
  console.log(`    members: ${serverWithRelations.members.length}`);
  console.log(`    channels: ${serverWithRelations.channels.length}`);

  const channelWithMessages = await prisma.channel.findFirst({
    where: { type: 'TEXT' },
    include: { messages: { include: { user: true } } }
  });
  console.log(`  Channel "${channelWithMessages.name}" has ${channelWithMessages.messages.length} messages`);

  const friendshipWithUsers = await prisma.friendship.findFirst({
    include: { user: true, friend: true }
  });
  console.log(`  Friendship: ${friendshipWithUsers.user.username} <-> ${friendshipWithUsers.friend.username} (${friendshipWithUsers.status})`);

  // 6. Constraints check
  console.log('\nCONSTRAINT CHECK:');
  try {
    await prisma.user.create({ data: { username: 'testuser1', discriminator: '9999', passwordHash: 'x' } });
    console.log('  UNIQUE username: FAIL (duplicate allowed)');
  } catch (e) {
    console.log('  UNIQUE username: OK (rejected duplicate)');
  }

  try {
    await prisma.user.create({ data: { username: 'newuser', discriminator: '0001', passwordHash: 'x' } });
    console.log('  UNIQUE discriminator: FAIL (duplicate allowed)');
  } catch (e) {
    console.log('  UNIQUE discriminator: OK (rejected duplicate)');
  }

  console.log('\n=== VERIFICATION COMPLETE ===');
  console.log(`\nOVERALL: ${allMatch && match1 ? 'PASS' : 'FAIL'}`);

  await prisma.$disconnect();
}

verify().catch(e => { console.error('ERROR:', e); process.exit(1); });
