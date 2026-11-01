/**
 * Vibe-Voice E2E Test Script
 * Görev 17: Kapsamlı E2E testleri
 */

import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';
const TEST_ROOM = 'e2e-test-room';

console.log('============================================================');
console.log('VIBE-VOICE E2E TEST SUITE');
console.log('============================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, details = '') {
  if (passed) {
    console.log(`✅ [PASS] ${name}`);
    testsPassed++;
  } else {
    console.log(`❌ [FAIL] ${name}`);
    testsFailed++;
  }
  if (details) {
    console.log(`   ${details}`);
  }
}

async function runTests() {
  try {
    // Test 1: Backend health check
    console.log('\n[TEST 1] Backend Health Check');
    const healthResponse = await fetch(`${BACKEND_URL}/api/health`);
    const healthData = await healthResponse.json();
    logTest(
      'Backend health endpoint',
      healthData.status === 'ok',
      `Status: ${healthData.status}, Uptime: ${healthData.uptime.toFixed(2)}s`
    );

    // Test 2: Rooms list endpoint
    console.log('\n[TEST 2] Rooms List Endpoint');
    const roomsResponse = await fetch(`${BACKEND_URL}/api/rooms`);
    const roomsData = await roomsResponse.json();
    logTest(
      'Rooms list endpoint',
      Array.isArray(roomsData.rooms),
      `Rooms count: ${roomsData.rooms.length}`
    );

    // Test 3: Invalid room ID rejection (REST)
    console.log('\n[TEST 3] Invalid Room ID Rejection (REST)');
    const invalidRoomResponse = await fetch(`${BACKEND_URL}/api/rooms/invalid!!!`);
    logTest(
      'Invalid room ID rejected',
      invalidRoomResponse.status === 400,
      `Status: ${invalidRoomResponse.status}`
    );

    // Test 4: Socket.io connection
    console.log('\n[TEST 4] Socket.io Connection');
    const socket1 = io(BACKEND_URL, { transports: ['websocket'] });
    await new Promise((resolve) => {
      socket1.on('connect', () => {
        logTest('Socket.io connection', socket1.connected, `Socket ID: ${socket1.id}`);
        resolve();
      });
    });

    // Test 5: Join room
    console.log('\n[TEST 5] Join Room');
    const joinResult = await new Promise((resolve) => {
      socket1.emit('join-room', { roomId: TEST_ROOM, userId: 'user-alice' }, (response) => {
        resolve(response);
      });
    });
    logTest(
      'Join room',
      joinResult.success,
      `Success: ${joinResult.success}, Users: ${joinResult.users?.length || 0}`
    );

    // Test 6: Second user joins
    console.log('\n[TEST 6] Second User Joins');
    const socket2 = io(BACKEND_URL, { transports: ['websocket'] });
    await new Promise((resolve) => {
      socket2.on('connect', resolve);
    });

    const join2Result = await new Promise((resolve) => {
      socket2.emit('join-room', { roomId: TEST_ROOM, userId: 'user-bob' }, (response) => {
        resolve(response);
      });
    });
    logTest(
      'Second user joins',
      join2Result.success && join2Result.users?.length === 2,
      `Users: ${join2Result.users?.length || 0}`
    );

    // Test 7: Room detail endpoint
    console.log('\n[TEST 7] Room Detail Endpoint');
    const roomDetailResponse = await fetch(`${BACKEND_URL}/api/rooms/${TEST_ROOM}`);
    const roomDetailData = await roomDetailResponse.json();
    logTest(
      'Room detail endpoint',
      roomDetailData.userCount === 2,
      `User count: ${roomDetailData.userCount}, Users: ${roomDetailData.users?.map(u => u.userId).join(', ')}`
    );

    // Test 8: WebRTC signaling - offer
    console.log('\n[TEST 8] WebRTC Signaling - Offer');
    const offerReceived = new Promise((resolve) => {
      socket2.on('signal-offer', (data) => {
        resolve(data);
      });
    });

    socket1.emit('signal-offer', {
      targetUserId: 'user-bob',
      offer: { type: 'offer', sdp: 'test-offer-sdp' },
    });

    const offerData = await offerReceived;
    logTest(
      'Offer signaling',
      offerData.from === 'user-alice' && offerData.offer?.sdp === 'test-offer-sdp',
      `From: ${offerData.from}, SDP: ${offerData.offer?.sdp}`
    );

    // Test 9: WebRTC signaling - answer
    console.log('\n[TEST 9] WebRTC Signaling - Answer');
    const answerReceived = new Promise((resolve) => {
      socket1.on('signal-answer', (data) => {
        resolve(data);
      });
    });

    socket2.emit('signal-answer', {
      targetUserId: 'user-alice',
      answer: { type: 'answer', sdp: 'test-answer-sdp' },
    });

    const answerData = await answerReceived;
    logTest(
      'Answer signaling',
      answerData.from === 'user-bob' && answerData.answer?.sdp === 'test-answer-sdp',
      `From: ${answerData.from}, SDP: ${answerData.answer?.sdp}`
    );

    // Test 10: WebRTC signaling - ICE candidate
    console.log('\n[TEST 10] WebRTC Signaling - ICE Candidate');
    const iceReceived = new Promise((resolve) => {
      socket2.on('signal-ice-candidate', (data) => {
        resolve(data);
      });
    });

    socket1.emit('signal-ice-candidate', {
      targetUserId: 'user-bob',
      candidate: { candidate: 'test-candidate', sdpMid: '0', sdpMLineIndex: 0 },
    });

    const iceData = await iceReceived;
    logTest(
      'ICE candidate signaling',
      iceData.from === 'user-alice' && iceData.candidate?.candidate === 'test-candidate',
      `From: ${iceData.from}, Candidate: ${iceData.candidate?.candidate}`
    );

    // Test 11: Chat message
    console.log('\n[TEST 11] Chat Message');
    const chatReceived = new Promise((resolve) => {
      socket2.on('chat-message', (data) => {
        resolve(data);
      });
    });

    const chatResult = await new Promise((resolve) => {
      socket1.emit(
        'chat-message',
        { roomId: TEST_ROOM, userId: 'user-alice', message: 'Hello from Alice!' },
        (response) => {
          resolve(response);
        }
      );
    });

    const chatData = await chatReceived;
    logTest(
      'Chat message',
      chatResult.success && chatData.from === 'user-alice' && chatData.message === 'Hello from Alice!',
      `From: ${chatData.from}, Message: ${chatData.message}`
    );

    // Test 12: Chat rate limiting
    console.log('\n[TEST 12] Chat Rate Limiting');
    let rateLimitHit = false;
    for (let i = 0; i < 15; i++) {
      const result = await new Promise((resolve) => {
        socket1.emit(
          'chat-message',
          { roomId: TEST_ROOM, userId: 'user-alice', message: `Message ${i}` },
          (response) => {
            resolve(response);
          }
        );
      });
      if (!result.success && result.error?.includes('Rate limit')) {
        rateLimitHit = true;
        break;
      }
    }
    logTest(
      'Chat rate limiting',
      rateLimitHit,
      `Rate limit triggered: ${rateLimitHit}`
    );

    // Test 13: Chat message validation
    console.log('\n[TEST 13] Chat Message Validation');
    const emptyMsgResult = await new Promise((resolve) => {
      socket1.emit(
        'chat-message',
        { roomId: TEST_ROOM, userId: 'user-alice', message: '' },
        (response) => {
          resolve(response);
        }
      );
    });
    logTest(
      'Empty message rejected',
      !emptyMsgResult.success && emptyMsgResult.error?.includes('empty'),
      `Error: ${emptyMsgResult.error}`
    );

    // Test 14: 5th user rejection (max 4)
    console.log('\n[TEST 14] Room Capacity Limit (Max 4)');
    const socket3 = io(BACKEND_URL, { transports: ['websocket'] });
    const socket4 = io(BACKEND_URL, { transports: ['websocket'] });
    const socket5 = io(BACKEND_URL, { transports: ['websocket'] });

    await Promise.all([
      new Promise((resolve) => socket3.on('connect', resolve)),
      new Promise((resolve) => socket4.on('connect', resolve)),
      new Promise((resolve) => socket5.on('connect', resolve)),
    ]);

    await new Promise((resolve) => {
      socket3.emit('join-room', { roomId: TEST_ROOM, userId: 'user-charlie' }, resolve);
    });
    await new Promise((resolve) => {
      socket4.emit('join-room', { roomId: TEST_ROOM, userId: 'user-dave' }, resolve);
    });

    const fifthUserResult = await new Promise((resolve) => {
      socket5.emit('join-room', { roomId: TEST_ROOM, userId: 'user-eve' }, (response) => {
        resolve(response);
      });
    });

    logTest(
      '5th user rejected',
      !fifthUserResult.success && fifthUserResult.error?.includes('full'),
      `Error: ${fifthUserResult.error}`
    );

    // Test 15: User disconnect cleanup
    console.log('\n[TEST 15] User Disconnect Cleanup');
    socket5.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const roomAfterDisconnect = await fetch(`${BACKEND_URL}/api/rooms/${TEST_ROOM}`);
    const roomDataAfter = await roomAfterDisconnect.json();
    logTest(
      'User disconnect cleanup',
      roomDataAfter.userCount === 4,
      `User count after disconnect: ${roomDataAfter.userCount}`
    );

    // Test 16: Leave room
    console.log('\n[TEST 16] Leave Room');
    const leaveResult = await new Promise((resolve) => {
      socket1.emit('leave-room', {}, (response) => {
        resolve(response);
      });
    });
    logTest(
      'Leave room',
      leaveResult.success,
      `Success: ${leaveResult.success}`
    );

    // Test 17: Room deletion after last user leaves
    console.log('\n[TEST 17] Room Deletion After Last User');
    socket2.disconnect();
    socket3.disconnect();
    socket4.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const roomAfterAllLeft = await fetch(`${BACKEND_URL}/api/rooms/${TEST_ROOM}`);
    logTest(
      'Room deleted after last user',
      roomAfterAllLeft.status === 404,
      `Status: ${roomAfterAllLeft.status}`
    );

    // Cleanup
    socket1.disconnect();

    // Summary
    console.log('\n============================================================');
    console.log('TEST SUMMARY');
    console.log('============================================================');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📊 Total: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('============================================================\n');

    if (testsFailed === 0) {
      console.log('✅ ALL TESTS PASSED!\n');
    } else {
      console.log(`⚠️ ${testsFailed} TEST(S) FAILED\n`);
    }

    process.exit(testsFailed === 0 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ TEST SUITE ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
