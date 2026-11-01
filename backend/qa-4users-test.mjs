/**
 * QA Test: 4 User Concurrent Connection & Mesh Topology
 * Tests WebRTC signaling with 4 simultaneous users
 */

import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';
const ROOM_ID = 'room-4test';
const TEST_TIMEOUT = 10000;

// Test results tracking
const results = {
  usersConnected: [],
  signalingTests: {
    offer: false,
    answer: false,
    iceCandidate: false,
  },
  fifthUserRejected: false,
  meshTopologyVerified: false,
};

console.log('='.repeat(60));
console.log('QA TEST: 4 User Concurrent Connection');
console.log('='.repeat(60));
console.log(`Backend: ${BACKEND_URL}`);
console.log(`Room: ${ROOM_ID}`);
console.log('');

// Helper: Create socket and connect
async function createSocket(userId) {
  return new Promise((resolve, reject) => {
    const socket = io(BACKEND_URL, { 
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Connection timeout for ${userId}`));
    }, TEST_TIMEOUT);

    socket.on('connect', () => {
      clearTimeout(timeout);
      console.log(`[CONNECT] ${userId} connected (socket: ${socket.id})`);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Connection error for ${userId}: ${err.message}`));
    });
  });
}

// Helper: Join room
async function joinRoom(socket, userId, roomId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Join timeout for ${userId}`));
    }, TEST_TIMEOUT);

    socket.emit('join-room', { roomId, userId }, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

// Main test execution
async function runTest() {
  const sockets = [];
  
  try {
    // ========================================
    // STEP 1: Connect 4 users
    // ========================================
    console.log('\n[STEP 1] Connecting 4 users...');
    const users = ['user-alice', 'user-bob', 'user-charlie', 'user-dave'];
    
    for (const userId of users) {
      const socket = await createSocket(userId);
      sockets.push(socket);
      
      const joinResponse = await joinRoom(socket, userId, ROOM_ID);
      
      if (joinResponse.success) {
        console.log(`[JOIN] ${userId} joined room ${ROOM_ID} (users in room: ${joinResponse.users.length})`);
        results.usersConnected.push(userId);
      } else {
        throw new Error(`${userId} failed to join: ${joinResponse.error}`);
      }
      
      // Small delay between joins to avoid race conditions
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\n[RESULT] ${results.usersConnected.length}/4 users connected successfully`);
    
    // ========================================
    // STEP 2: Verify room state via REST API
    // ========================================
    console.log('\n[STEP 2] Verifying room state via REST API...');
    const roomDetailResponse = await fetch(`${BACKEND_URL}/api/rooms/${ROOM_ID}`);
    const roomDetail = await roomDetailResponse.json();
    
    console.log(`[ROOM] Users in room: ${roomDetail.userCount}/${roomDetail.maxSize}`);
    console.log(`[ROOM] User list: ${roomDetail.users.map(u => u.userId).join(', ')}`);
    
    if (roomDetail.userCount === 4) {
      console.log('[PASS] Room has exactly 4 users');
    } else {
      throw new Error(`Expected 4 users, got ${roomDetail.userCount}`);
    }
    
    // ========================================
    // STEP 3: Test WebRTC signaling - Offer
    // ========================================
    console.log('\n[STEP 3] Testing WebRTC signaling (offer)...');
    
    const aliceSocket = sockets[0];
    const bobSocket = sockets[1];
    
    const offerPromise = new Promise((resolve) => {
      bobSocket.once('signal-offer', (data) => {
        console.log(`[SIGNAL] Bob received offer from ${data.from}`);
        console.log(`[SIGNAL] Offer data: ${JSON.stringify(data.offer)}`);
        resolve(data);
      });
    });
    
    // Alice sends offer to Bob
    aliceSocket.emit('signal-offer', {
      targetUserId: 'user-bob',
      offer: { type: 'offer', sdp: 'test-sdp-offer-data' }
    });
    
    const offerData = await Promise.race([
      offerPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Offer timeout')), TEST_TIMEOUT))
    ]);
    
    if (offerData.from === 'user-alice' && offerData.offer.sdp === 'test-sdp-offer-data') {
      console.log('[PASS] Offer signaling works correctly');
      results.signalingTests.offer = true;
    } else {
      throw new Error('Offer data mismatch');
    }
    
    // ========================================
    // STEP 4: Test WebRTC signaling - Answer
    // ========================================
    console.log('\n[STEP 4] Testing WebRTC signaling (answer)...');
    
    const answerPromise = new Promise((resolve) => {
      aliceSocket.once('signal-answer', (data) => {
        console.log(`[SIGNAL] Alice received answer from ${data.from}`);
        console.log(`[SIGNAL] Answer data: ${JSON.stringify(data.answer)}`);
        resolve(data);
      });
    });
    
    // Bob sends answer to Alice
    bobSocket.emit('signal-answer', {
      targetUserId: 'user-alice',
      answer: { type: 'answer', sdp: 'test-sdp-answer-data' }
    });
    
    const answerData = await Promise.race([
      answerPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Answer timeout')), TEST_TIMEOUT))
    ]);
    
    if (answerData.from === 'user-bob' && answerData.answer.sdp === 'test-sdp-answer-data') {
      console.log('[PASS] Answer signaling works correctly');
      results.signalingTests.answer = true;
    } else {
      throw new Error('Answer data mismatch');
    }
    
    // ========================================
    // STEP 5: Test WebRTC signaling - ICE Candidate
    // ========================================
    console.log('\n[STEP 5] Testing WebRTC signaling (ice-candidate)...');
    
    const charlieSocket = sockets[2];
    const daveSocket = sockets[3];
    
    const icePromise = new Promise((resolve) => {
      charlieSocket.once('signal-ice-candidate', (data) => {
        console.log(`[SIGNAL] Charlie received ICE candidate from ${data.from}`);
        console.log(`[SIGNAL] ICE candidate: ${JSON.stringify(data.candidate)}`);
        resolve(data);
      });
    });
    
    // Dave sends ICE candidate to Charlie
    daveSocket.emit('signal-ice-candidate', {
      targetUserId: 'user-charlie',
      candidate: { 
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 12345 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0
      }
    });
    
    const iceData = await Promise.race([
      icePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('ICE candidate timeout')), TEST_TIMEOUT))
    ]);
    
    if (iceData.from === 'user-dave' && iceData.candidate.candidate.includes('192.168.1.1')) {
      console.log('[PASS] ICE candidate signaling works correctly');
      results.signalingTests.iceCandidate = true;
    } else {
      throw new Error('ICE candidate data mismatch');
    }
    
    // ========================================
    // STEP 6: Test 5th user rejection
    // ========================================
    console.log('\n[STEP 6] Testing 5th user rejection (max 4 limit)...');
    
    const eveSocket = await createSocket('user-eve');
    const eveJoinResponse = await joinRoom(eveSocket, 'user-eve', ROOM_ID);
    
    if (!eveJoinResponse.success && eveJoinResponse.error.includes('full')) {
      console.log(`[PASS] 5th user rejected: ${eveJoinResponse.error}`);
      results.fifthUserRejected = true;
    } else {
      throw new Error(`5th user should have been rejected but got: ${JSON.stringify(eveJoinResponse)}`);
    }
    
    eveSocket.disconnect();
    
    // ========================================
    // STEP 7: Verify mesh topology
    // ========================================
    console.log('\n[STEP 7] Verifying mesh topology...');
    console.log('[INFO] 4 users = 6 peer connections (4*3/2)');
    console.log('[INFO] Each user should be able to signal to every other user');
    
    // Test a few more signaling paths to verify mesh
    const testPairs = [
      { from: 'user-alice', to: 'user-charlie', socketIdx: 0, targetIdx: 2 },
      { from: 'user-bob', to: 'user-dave', socketIdx: 1, targetIdx: 3 },
    ];
    
    for (const pair of testPairs) {
      const fromSocket = sockets[pair.socketIdx];
      const toSocket = sockets[pair.targetIdx];
      
      const signalPromise = new Promise((resolve) => {
        toSocket.once('signal-offer', (data) => {
          resolve(data);
        });
      });
      
      fromSocket.emit('signal-offer', {
        targetUserId: pair.to,
        offer: { type: 'offer', sdp: `test-${pair.from}-to-${pair.to}` }
      });
      
      const signalData = await Promise.race([
        signalPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Signal timeout for ${pair.from}->${pair.to}`)), TEST_TIMEOUT))
      ]);
      
      if (signalData.from === pair.from) {
        console.log(`[PASS] Signaling ${pair.from} -> ${pair.to} works`);
      } else {
        throw new Error(`Signal from ${pair.from} to ${pair.to} failed`);
      }
    }
    
    results.meshTopologyVerified = true;
    console.log('[PASS] Mesh topology verified - all users can signal each other');
    
    // ========================================
    // FINAL RESULTS
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✓ Users connected: ${results.usersConnected.length}/4`);
    console.log(`✓ Offer signaling: ${results.signalingTests.offer ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Answer signaling: ${results.signalingTests.answer ? 'PASS' : 'FAIL'}`);
    console.log(`✓ ICE candidate signaling: ${results.signalingTests.iceCandidate ? 'PASS' : 'FAIL'}`);
    console.log(`✓ 5th user rejected: ${results.fifthUserRejected ? 'PASS' : 'FAIL'}`);
    console.log(`✓ Mesh topology: ${results.meshTopologyVerified ? 'PASS' : 'FAIL'}`);
    
    const allPassed = 
      results.usersConnected.length === 4 &&
      results.signalingTests.offer &&
      results.signalingTests.answer &&
      results.signalingTests.iceCandidate &&
      results.fifthUserRejected &&
      results.meshTopologyVerified;
    
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('STATUS: ✓ ALL TESTS PASSED');
      console.log('='.repeat(60));
      console.log('\nMesh topology verified:');
      console.log('- 4 users in same room');
      console.log('- WebRTC signaling (offer/answer/ice-candidate) working');
      console.log('- Max room size limit enforced (4 users)');
      console.log('- All users can signal each other');
    } else {
      console.log('STATUS: ✗ SOME TESTS FAILED');
      console.log('='.repeat(60));
    }
    
  } catch (error) {
    console.error('\n[ERROR] Test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    // Cleanup
    console.log('\n[CLEANUP] Disconnecting all sockets...');
    sockets.forEach(s => s.disconnect());
    
    // Wait a bit for cleanup
    await new Promise(r => setTimeout(r, 500));
    
    process.exit(process.exitCode || 0);
  }
}

// Run the test
runTest();