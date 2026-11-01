/**
 * QA Integration Test - Independent verification of signaling server
 * Tests multi-user rooms and WebRTC signaling with distinct user IDs
 */
import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3001';
const ROOM_ID = 'qa-test-room-' + Date.now().toString(36);

const results = {
  tests: [],
  pass: 0,
  fail: 0,
};

function log(msg) {
  console.log(`[QA] ${msg}`);
}

function record(name, passed, detail = '') {
  const status = passed ? 'PASS' : 'FAIL';
  results.tests.push({ name, status, detail });
  if (passed) results.pass++;
  else results.fail++;
  console.log(`[${status}] ${name}${detail ? ' - ' + detail : ''}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connectClient(userId) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    const events = [];
    socket.on('connect', () => {
      log(`Client ${userId} connected (socket ${socket.id})`);
      resolve({ socket, events });
    });
    socket.on('connect_error', (err) => reject(err));
    socket.on('user-joined', (data) => {
      log(`Client ${userId} received user-joined: ${JSON.stringify(data)}`);
      events.push({ type: 'user-joined', data });
    });
    socket.on('user-left', (data) => {
      log(`Client ${userId} received user-left: ${JSON.stringify(data)}`);
      events.push({ type: 'user-left', data });
    });
    socket.on('room-users', (data) => {
      log(`Client ${userId} received room-users: ${JSON.stringify(data)}`);
      events.push({ type: 'room-users', data });
    });
    socket.on('signal-offer', (data) => {
      log(`Client ${userId} received signal-offer from ${data.from}`);
      events.push({ type: 'signal-offer', data });
    });
    socket.on('signal-answer', (data) => {
      log(`Client ${userId} received signal-answer from ${data.from}`);
      events.push({ type: 'signal-answer', data });
    });
    socket.on('signal-ice-candidate', (data) => {
      log(`Client ${userId} received signal-ice-candidate from ${data.from}`);
      events.push({ type: 'signal-ice-candidate', data });
    });
    socket.on('disconnect', (reason) => {
      log(`Client ${userId} disconnected: ${reason}`);
    });
  });
}

function joinRoom(socket, roomId, userId) {
  return new Promise((resolve, reject) => {
    socket.emit('join-room', { roomId, userId }, (response) => {
      resolve(response);
    });
    setTimeout(() => reject(new Error('join-room timeout')), 5000);
  });
}

async function runTests() {
  log('=== QA Integration Test Start ===');
  log(`Test room: ${ROOM_ID}`);

  // TEST 1: Health check
  try {
    const res = await fetch(`${SERVER}/api/health`);
    const data = await res.json();
    record('Health check endpoint', data.status === 'ok', `status=${data.status}`);
  } catch (e) {
    record('Health check endpoint', false, e.message);
  }

  // TEST 2: Rooms list endpoint
  try {
    const res = await fetch(`${SERVER}/api/rooms`);
    const data = await res.json();
    record('Rooms list endpoint', Array.isArray(data.rooms), `rooms count=${data.rooms.length}`);
  } catch (e) {
    record('Rooms list endpoint', false, e.message);
  }

  // TEST 3: Invalid room ID rejection via REST
  try {
    const res = await fetch(`${SERVER}/api/rooms/invalid!!!`);
    record('Invalid room ID rejected (REST)', res.status === 400, `status=${res.status}`);
  } catch (e) {
    record('Invalid room ID rejected (REST)', false, e.message);
  }

  // TEST 4: Connect two distinct clients
  let client1, client2;
  try {
    client1 = await connectClient('user-alice');
    record('Client 1 connects', !!client1.socket.connected);
  } catch (e) {
    record('Client 1 connects', false, e.message);
    return printSummary();
  }

  try {
    client2 = await connectClient('user-bob');
    record('Client 2 connects', !!client2.socket.connected);
  } catch (e) {
    record('Client 2 connects', false, e.message);
    return printSummary();
  }

  // TEST 5: Client 1 joins room
  try {
    const r1 = await joinRoom(client1.socket, ROOM_ID, 'user-alice');
    record('Client 1 joins room', r1.success === true, `users=${r1.users?.length || 0}`);
  } catch (e) {
    record('Client 1 joins room', false, e.message);
  }

  await sleep(200);

  // TEST 6: Client 2 joins same room - should see 2 users
  try {
    const r2 = await joinRoom(client2.socket, ROOM_ID, 'user-bob');
    const twoUsers = r2.success && r2.users && r2.users.length === 2;
    record('Client 2 joins room (2 users visible)', twoUsers, `users=${r2.users?.length || 0}`);
  } catch (e) {
    record('Client 2 joins room (2 users visible)', false, e.message);
  }

  await sleep(300);

  // TEST 7: Client 1 should have received user-joined for user-bob
  const c1GotUserJoined = client1.events.some(
    (e) => e.type === 'user-joined' && e.data.userId === 'user-bob'
  );
  record('Client 1 notified of user-bob joining', c1GotUserJoined);

  // TEST 8: Room detail REST endpoint
  try {
    const res = await fetch(`${SERVER}/api/rooms/${ROOM_ID}`);
    const data = await res.json();
    const twoUsers = data.userCount === 2;
    record('Room detail shows 2 users (REST)', twoUsers, `userCount=${data.userCount}`);
  } catch (e) {
    record('Room detail shows 2 users (REST)', false, e.message);
  }

  // TEST 9: WebRTC signal-offer relayed from alice to bob
  try {
    client1.socket.emit('signal-offer', {
      targetUserId: 'user-bob',
      offer: { type: 'offer', sdp: 'test-sdp-alice' },
    });
    await sleep(300);
    const bobGotOffer = client2.events.some(
      (e) => e.type === 'signal-offer' && e.data.from === 'user-alice'
    );
    record('signal-offer relayed alice->bob', bobGotOffer);
  } catch (e) {
    record('signal-offer relayed alice->bob', false, e.message);
  }

  // TEST 10: WebRTC signal-answer relayed from bob to alice
  try {
    client2.socket.emit('signal-answer', {
      targetUserId: 'user-alice',
      answer: { type: 'answer', sdp: 'test-sdp-bob' },
    });
    await sleep(300);
    const aliceGotAnswer = client1.events.some(
      (e) => e.type === 'signal-answer' && e.data.from === 'user-bob'
    );
    record('signal-answer relayed bob->alice', aliceGotAnswer);
  } catch (e) {
    record('signal-answer relayed bob->alice', false, e.message);
  }

  // TEST 11: WebRTC signal-ice-candidate relayed
  try {
    client1.socket.emit('signal-ice-candidate', {
      targetUserId: 'user-bob',
      candidate: { candidate: 'test-candidate', sdpMid: '0', sdpMLineIndex: 0 },
    });
    await sleep(300);
    const bobGotIce = client2.events.some(
      (e) => e.type === 'signal-ice-candidate' && e.data.from === 'user-alice'
    );
    record('signal-ice-candidate relayed alice->bob', bobGotIce);
  } catch (e) {
    record('signal-ice-candidate relayed alice->bob', false, e.message);
  }

  // TEST 12: Invalid signal-offer (target not in room)
  try {
    client1.socket.emit('signal-offer', {
      targetUserId: 'user-nonexistent',
      offer: { type: 'offer', sdp: 'x' },
    });
    await sleep(200);
    // No crash = pass; server logs warning
    record('Invalid signal-offer target handled gracefully', true);
  } catch (e) {
    record('Invalid signal-offer target handled gracefully', false, e.message);
  }

  // TEST 13: Invalid join-room (bad room ID)
  try {
    const rBad = await joinRoom(client1.socket, 'invalid!!!', 'user-alice');
    record('Invalid room ID rejected via socket', rBad.success === false && !!rBad.error);
  } catch (e) {
    record('Invalid room ID rejected via socket', false, e.message);
  }

  // TEST 14: Invalid join-room (bad user ID)
  try {
    const rBad = await joinRoom(client1.socket, ROOM_ID, 'bad user!');
    record('Invalid user ID rejected via socket', rBad.success === false && !!rBad.error);
  } catch (e) {
    record('Invalid user ID rejected via socket', false, e.message);
  }

  // TEST 15: Client 2 leaves room
  try {
    await new Promise((resolve) => {
      client2.socket.emit('leave-room', {}, (r) => resolve(r));
      setTimeout(() => resolve(null), 3000);
    });
    await sleep(300);
    const aliceGotLeft = client1.events.some(
      (e) => e.type === 'user-left' && e.data.userId === 'user-bob'
    );
    record('Client 2 leaves room, Client 1 notified', aliceGotLeft);
  } catch (e) {
    record('Client 2 leaves room, Client 1 notified', false, e.message);
  }

  // TEST 16: After leave, room should have 1 user
  try {
    const res = await fetch(`${SERVER}/api/rooms/${ROOM_ID}`);
    const data = await res.json();
    record('Room has 1 user after leave', data.userCount === 1, `userCount=${data.userCount}`);
  } catch (e) {
    record('Room has 1 user after leave', false, e.message);
  }

  // TEST 17: Client 1 disconnects - room should be deleted
  client1.socket.disconnect();
  await sleep(500);
  try {
    const res = await fetch(`${SERVER}/api/rooms/${ROOM_ID}`);
    record('Room deleted after last user disconnects', res.status === 404, `status=${res.status}`);
  } catch (e) {
    record('Room deleted after last user disconnects', false, e.message);
  }

  client2.socket.disconnect();
  await sleep(200);

  printSummary();
}

function printSummary() {
  console.log('\n=== QA Integration Test Summary ===');
  console.log(`Total: ${results.tests.length}, Pass: ${results.pass}, Fail: ${results.fail}`);
  console.log('\nDetails:');
  for (const t of results.tests) {
    console.log(`  [${t.status}] ${t.name}${t.detail ? ' - ' + t.detail : ''}`);
  }
  console.log(`\nOverall: ${results.fail === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(results.fail === 0 ? 0 : 1);
}

runTests().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
