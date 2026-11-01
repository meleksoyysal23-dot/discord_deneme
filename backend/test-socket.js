/**
 * Socket.io event handler test script
 * Görev 2 doğrulama testleri
 */

import { io as ioClient } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient(userId) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(SERVER_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    socket.on('connect', () => {
      socket.userId = userId;
      resolve(socket);
    });
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

function joinRoom(socket, roomId, userId) {
  return new Promise((resolve, reject) => {
    socket.emit('join-room', { roomId, userId }, (response) => {
      resolve(response);
    });
    setTimeout(() => reject(new Error('join-room timeout')), 3000);
  });
}

function leaveRoom(socket) {
  return new Promise((resolve, reject) => {
    socket.emit('leave-room', {}, (response) => {
      resolve(response);
    });
    setTimeout(() => reject(new Error('leave-room timeout')), 3000);
  });
}

async function runTests() {
  const results = {};

  // Test 1: Health check
  try {
    const res = await fetch(`${SERVER_URL}/api/health`);
    const data = await res.json();
    results['health-check'] = data.status === 'ok' ? 'OK' : 'FAIL';
    console.log(`[TEST] Health check: ${results['health-check']} - ${JSON.stringify(data)}`);
  } catch (err) {
    results['health-check'] = 'FAIL';
    console.log(`[TEST] Health check: FAIL - ${err.message}`);
  }

  // Test 2: Rooms list (empty)
  try {
    const res = await fetch(`${SERVER_URL}/api/rooms`);
    const data = await res.json();
    results['rooms-list-empty'] = Array.isArray(data.rooms) ? 'OK' : 'FAIL';
    console.log(`[TEST] Rooms list (empty): ${results['rooms-list-empty']}`);
  } catch (err) {
    results['rooms-list-empty'] = 'FAIL';
    console.log(`[TEST] Rooms list (empty): FAIL - ${err.message}`);
  }

  // Test 3: join-room success
  let client1;
  try {
    client1 = await createClient('user1');
    const response = await joinRoom(client1, 'test-room-1', 'user1');
    results['join-room-success'] = response.success === true ? 'OK' : 'FAIL';
    console.log(`[TEST] join-room success: ${results['join-room-success']} - ${JSON.stringify(response)}`);
  } catch (err) {
    results['join-room-success'] = 'FAIL';
    console.log(`[TEST] join-room success: FAIL - ${err.message}`);
  }

  // Test 4: Room ID validation - invalid characters
  let client2;
  try {
    client2 = await createClient('user2');
    const response = await joinRoom(client2, 'invalid room!@#', 'user2');
    results['room-id-validation'] = response.success === false && response.error ? 'OK' : 'FAIL';
    console.log(`[TEST] Room ID validation: ${results['room-id-validation']} - ${JSON.stringify(response)}`);
  } catch (err) {
    results['room-id-validation'] = 'FAIL';
    console.log(`[TEST] Room ID validation: FAIL - ${err.message}`);
  }

  // Test 5: Room ID validation - too long
  try {
    if (!client2) throw new Error('client2 not available');
    const longId = 'a'.repeat(51);
    const response = await joinRoom(client2, longId, 'user2');
    results['room-id-too-long'] = response.success === false && response.error ? 'OK' : 'FAIL';
    console.log(`[TEST] Room ID too long: ${results['room-id-too-long']} - ${JSON.stringify(response)}`);
  } catch (err) {
    results['room-id-too-long'] = 'FAIL';
    console.log(`[TEST] Room ID too long: FAIL - ${err.message}`);
  }

  // Test 6: User ID validation - invalid
  try {
    if (!client2) throw new Error('client2 not available');
    const response = await joinRoom(client2, 'valid-room', 'invalid user!');
    results['user-id-validation'] = response.success === false && response.error ? 'OK' : 'FAIL';
    console.log(`[TEST] User ID validation: ${results['user-id-validation']} - ${JSON.stringify(response)}`);
  } catch (err) {
    results['user-id-validation'] = 'FAIL';
    console.log(`[TEST] User ID validation: FAIL - ${err.message}`);
  }

  // Test 7: Multiple users join same room
  let client3, client4, client5;
  try {
    client3 = await createClient('user3');
    client4 = await createClient('user4');
    client5 = await createClient('user5');

    const r3 = await joinRoom(client3, 'test-room-1', 'user3');
    const r4 = await joinRoom(client4, 'test-room-1', 'user4');
    const r5 = await joinRoom(client5, 'test-room-1', 'user5');

    const allJoined = r3.success && r4.success && r5.success;
    results['multi-user-join'] = allJoined ? 'OK' : 'FAIL';
    console.log(`[TEST] Multi-user join (4 users): ${results['multi-user-join']}`);
    console.log(`  user1: ${JSON.stringify(r3)}`);
    console.log(`  user3: ${JSON.stringify(r3)}`);
    console.log(`  user4: ${JSON.stringify(r4)}`);
    console.log(`  user5: ${JSON.stringify(r5)}`);
  } catch (err) {
    results['multi-user-join'] = 'FAIL';
    console.log(`[TEST] Multi-user join: FAIL - ${err.message}`);
  }

  // Test 8: Room full (5th user should be rejected)
  let client6;
  try {
    client6 = await createClient('user6');
    const response = await joinRoom(client6, 'test-room-1', 'user6');
    results['room-full-reject'] = response.success === false && /full/i.test(response.error) ? 'OK' : 'FAIL';
    console.log(`[TEST] Room full reject: ${results['room-full-reject']} - ${JSON.stringify(response)}`);
  } catch (err) {
    results['room-full-reject'] = 'FAIL';
    console.log(`[TEST] Room full reject: FAIL - ${err.message}`);
  }

  // Test 9: Rooms list shows active room
  try {
    const res = await fetch(`${SERVER_URL}/api/rooms`);
    const data = await res.json();
    const room = data.rooms.find((r) => r.id === 'test-room-1');
    results['rooms-list-active'] = room && room.userCount === 4 ? 'OK' : 'FAIL';
    console.log(`[TEST] Rooms list active: ${results['rooms-list-active']} - userCount=${room?.userCount}`);
  } catch (err) {
    results['rooms-list-active'] = 'FAIL';
    console.log(`[TEST] Rooms list active: FAIL - ${err.message}`);
  }

  // Test 10: signal-offer relay
  try {
    let offerReceived = false;
    client3.on('signal-offer', (data) => {
      if (data.from === 'user1' && data.offer && data.offer.type === 'offer') {
        offerReceived = true;
      }
    });

    client1.emit('signal-offer', {
      targetUserId: 'user3',
      offer: { type: 'offer', sdp: 'v=0\r\n' },
    });

    await sleep(200);
    results['signal-offer'] = offerReceived ? 'OK' : 'FAIL';
    console.log(`[TEST] signal-offer relay: ${results['signal-offer']}`);
  } catch (err) {
    results['signal-offer'] = 'FAIL';
    console.log(`[TEST] signal-offer relay: FAIL - ${err.message}`);
  }

  // Test 11: signal-answer relay
  try {
    let answerReceived = false;
    client1.on('signal-answer', (data) => {
      if (data.from === 'user3' && data.answer && data.answer.type === 'answer') {
        answerReceived = true;
      }
    });

    client3.emit('signal-answer', {
      targetUserId: 'user1',
      answer: { type: 'answer', sdp: 'v=0\r\n' },
    });

    await sleep(200);
    results['signal-answer'] = answerReceived ? 'OK' : 'FAIL';
    console.log(`[TEST] signal-answer relay: ${results['signal-answer']}`);
  } catch (err) {
    results['signal-answer'] = 'FAIL';
    console.log(`[TEST] signal-answer relay: FAIL - ${err.message}`);
  }

  // Test 12: signal-ice-candidate relay
  try {
    let candidateReceived = false;
    client4.on('signal-ice-candidate', (data) => {
      if (data.from === 'user1' && data.candidate) {
        candidateReceived = true;
      }
    });

    client1.emit('signal-ice-candidate', {
      targetUserId: 'user4',
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 12345 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    });

    await sleep(200);
    results['signal-ice-candidate'] = candidateReceived ? 'OK' : 'FAIL';
    console.log(`[TEST] signal-ice-candidate relay: ${results['signal-ice-candidate']}`);
  } catch (err) {
    results['signal-ice-candidate'] = 'FAIL';
    console.log(`[TEST] signal-ice-candidate relay: FAIL - ${err.message}`);
  }

  // Test 13: leave-room
  try {
    const response = await leaveRoom(client1);
    results['leave-room'] = response.success === true ? 'OK' : 'FAIL';
    console.log(`[TEST] leave-room: ${results['leave-room']}`);
  } catch (err) {
    results['leave-room'] = 'FAIL';
    console.log(`[TEST] leave-room: FAIL - ${err.message}`);
  }

  // Test 14: disconnect handling - disconnect a user and check room
  try {
    client3.disconnect();
    await sleep(300);

    const res = await fetch(`${SERVER_URL}/api/rooms`);
    const data = await res.json();
    const room = data.rooms.find((r) => r.id === 'test-room-1');
    // user1 left, user3 disconnected, so 2 left (user4, user5)
    results['disconnect-handling'] = room && room.userCount === 2 ? 'OK' : 'FAIL';
    console.log(`[TEST] Disconnect handling: ${results['disconnect-handling']} - userCount=${room?.userCount}`);
  } catch (err) {
    results['disconnect-handling'] = 'FAIL';
    console.log(`[TEST] Disconnect handling: FAIL - ${err.message}`);
  }

  // Test 15: Room auto-delete when empty
  try {
    client4.disconnect();
    client5.disconnect();
    await sleep(300);

    const res = await fetch(`${SERVER_URL}/api/rooms`);
    const data = await res.json();
    const room = data.rooms.find((r) => r.id === 'test-room-1');
    results['room-auto-delete'] = !room ? 'OK' : 'FAIL';
    console.log(`[TEST] Room auto-delete: ${results['room-auto-delete']}`);
  } catch (err) {
    results['room-auto-delete'] = 'FAIL';
    console.log(`[TEST] Room auto-delete: FAIL - ${err.message}`);
  }

  // Test 16: Body size limit
  try {
    const bigPayload = { data: 'x'.repeat(15000) };
    const res = await fetch(`${SERVER_URL}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bigPayload),
    });
    // Express returns 413 for payload too large
    results['body-size-limit'] = res.status === 413 || res.status === 400 ? 'OK' : 'FAIL';
    console.log(`[TEST] Body size limit: ${results['body-size-limit']} - status=${res.status}`);
  } catch (err) {
    results['body-size-limit'] = 'FAIL';
    console.log(`[TEST] Body size limit: FAIL - ${err.message}`);
  }

  // Test 17: Rate limiting (health endpoint)
  try {
    // Send 105 rapid requests
    let blockedCount = 0;
    for (let i = 0; i < 105; i++) {
      const res = await fetch(`${SERVER_URL}/api/health`);
      if (res.status === 429) blockedCount++;
    }
    results['rate-limiting'] = blockedCount > 0 ? 'OK' : 'FAIL';
    console.log(`[TEST] Rate limiting: ${results['rate-limiting']} - blocked=${blockedCount}/105`);
  } catch (err) {
    results['rate-limiting'] = 'FAIL';
    console.log(`[TEST] Rate limiting: FAIL - ${err.message}`);
  }

  // Cleanup
  if (client2) client2.disconnect();
  if (client6) client6.disconnect();

  // Summary
  console.log('\n========== TEST SUMMARY ==========');
  let passCount = 0;
  let failCount = 0;
  for (const [test, result] of Object.entries(results)) {
    const icon = result === 'OK' ? '✓' : '✗';
    console.log(`  ${icon} ${test}: ${result}`);
    if (result === 'OK') passCount++;
    else failCount++;
  }
  console.log(`\nTotal: ${passCount} passed, ${failCount} failed out of ${passCount + failCount}`);
  console.log('==================================');

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
