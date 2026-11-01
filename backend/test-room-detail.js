/**
 * Test script for GET /api/rooms/:id endpoint
 * Creates a room via socket.io, then tests the REST endpoint
 */

import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';
const TEST_ROOM_ID = 'test-room-123';
const TEST_USER_ID = 'test-user-456';

async function testRoomDetailEndpoint() {
  console.log('=== Room Detail Endpoint Test ===\n');

  // Connect to socket.io
  console.log('1. Connecting to socket.io...');
  const socket = io(SOCKET_URL, {
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log(`   ✓ Connected with socket ID: ${socket.id}\n`);
      resolve();
    });
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });

  // Join a room
  console.log('2. Joining test room...');
  const joinResult = await new Promise((resolve) => {
    socket.emit('join-room', { roomId: TEST_ROOM_ID, userId: TEST_USER_ID }, (response) => {
      resolve(response);
    });
  });

  if (joinResult.success) {
    console.log(`   ✓ Successfully joined room: ${TEST_ROOM_ID}`);
    console.log(`   ✓ Users in room: ${joinResult.users.length}\n`);
  } else {
    console.error(`   ✗ Failed to join room: ${joinResult.error}`);
    socket.disconnect();
    process.exit(1);
  }

  // Wait a moment for the room to be fully created
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Test the REST endpoint
  console.log('3. Testing GET /api/rooms/:id endpoint...');
  try {
    const response = await fetch(`http://localhost:3001/api/rooms/${TEST_ROOM_ID}`);
    const data = await response.json();

    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));

    // Verify response structure
    console.log('\n4. Verifying response structure...');
    
    const checks = [
      { name: 'Status is 200', pass: response.status === 200 },
      { name: 'roomId matches', pass: data.roomId === TEST_ROOM_ID },
      { name: 'userCount is correct', pass: data.userCount === 1 },
      { name: 'maxSize is present', pass: typeof data.maxSize === 'number' },
      { name: 'users array exists', pass: Array.isArray(data.users) },
      { name: 'users has correct length', pass: data.users.length === 1 },
      { name: 'user has userId', pass: data.users[0]?.userId === TEST_USER_ID },
      { name: 'socketId is HIDDEN (security)', pass: !data.users[0]?.socketId },
      { name: 'createdAt is present', pass: typeof data.createdAt === 'number' },
    ];

    checks.forEach((check) => {
      console.log(`   ${check.pass ? '✓' : '✗'} ${check.name}`);
    });

    const allPassed = checks.every((c) => c.pass);
    console.log(`\n${allPassed ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}\n`);

  } catch (error) {
    console.error(`   ✗ Error testing endpoint:`, error.message);
  }

  // Cleanup
  console.log('5. Cleaning up...');
  socket.disconnect();
  console.log('   ✓ Disconnected\n');

  console.log('=== Test Complete ===');
  process.exit(0);
}

testRoomDetailEndpoint().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
