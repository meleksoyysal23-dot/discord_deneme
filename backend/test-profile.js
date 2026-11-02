/**
 * Test: User Profile Fields
 * gender, avatar, lastSeen, isOnline alanlarını test et
 */

import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

async function testProfiles() {
  console.log('🧪 Testing user profile fields...\n');

  // Test 1: User with profile joins room
  console.log('Test 1: User joins with profile (gender: male, avatar: 5)');
  const socket1 = io(SERVER_URL, { transports: ['websocket'] });
  
  await new Promise((resolve) => {
    socket1.on('connect', () => {
      console.log(`✓ Socket 1 connected: ${socket1.id}`);
      
      socket1.emit('join-room', {
        roomId: 'test-room-profile',
        userId: 'user-alice',
        gender: 'male',
        avatar: 5,
      }, (response) => {
        console.log('✓ Join response:', response);
        
        if (response.success) {
          console.log('✓ Users in room:', response.users);
          const alice = response.users.find(u => u.userId === 'user-alice');
          if (alice) {
            console.log('✓ Alice profile:', {
              gender: alice.gender,
              avatar: alice.avatar,
              lastSeen: alice.lastSeen ? 'present' : 'missing',
              isOnline: alice.isOnline,
            });
            
            if (alice.gender === 'male' && alice.avatar === 5 && alice.isOnline === true) {
              console.log('✅ Test 1 PASSED: Profile fields correctly stored\n');
            } else {
              console.log('❌ Test 1 FAILED: Profile fields incorrect\n');
            }
          }
        }
        resolve();
      });
    });
  });

  // Test 2: Second user joins and sees first user's profile
  console.log('Test 2: Second user joins and sees first user\'s profile');
  const socket2 = io(SERVER_URL, { transports: ['websocket'] });
  
  await new Promise((resolve) => {
    socket2.on('connect', () => {
      console.log(`✓ Socket 2 connected: ${socket2.id}`);
      
      socket2.emit('join-room', {
        roomId: 'test-room-profile',
        userId: 'user-bob',
        gender: 'female',
        avatar: 12,
      }, (response) => {
        console.log('✓ Join response:', response);
        
        if (response.success) {
          const alice = response.users.find(u => u.userId === 'user-alice');
          const bob = response.users.find(u => u.userId === 'user-bob');
          
          if (alice && bob) {
            console.log('✓ Alice (seen by Bob):', {
              gender: alice.gender,
              avatar: alice.avatar,
              isOnline: alice.isOnline,
            });
            console.log('✓ Bob:', {
              gender: bob.gender,
              avatar: bob.avatar,
              isOnline: bob.isOnline,
            });
            
            if (alice.gender === 'male' && alice.avatar === 5 &&
                bob.gender === 'female' && bob.avatar === 12) {
              console.log('✅ Test 2 PASSED: Both users see each other\'s profiles\n');
            } else {
              console.log('❌ Test 2 FAILED: Profile data mismatch\n');
            }
          }
        }
        resolve();
      });
    });
  });

  // Test 3: Chat message updates lastSeen
  console.log('Test 3: Chat message updates lastSeen');
  const initialLastSeen = null;
  
  await new Promise((resolve) => {
    socket1.emit('chat-message', {
      roomId: 'test-room-profile',
      userId: 'user-alice',
      message: 'Hello world!',
    }, (response) => {
      console.log('✓ Chat message sent:', response.success);
      
      // Check REST endpoint for updated lastSeen
      setTimeout(async () => {
        try {
          const res = await fetch('http://localhost:3001/api/rooms/test-room-profile');
          const data = await res.json();
          const alice = data.users.find(u => u.userId === 'user-alice');
          
          if (alice && alice.lastSeen) {
            console.log('✓ Alice lastSeen after chat:', new Date(alice.lastSeen).toISOString());
            console.log('✅ Test 3 PASSED: lastSeen updated on chat\n');
          } else {
            console.log('❌ Test 3 FAILED: lastSeen not updated\n');
          }
        } catch (err) {
          console.log('❌ Test 3 FAILED: Could not fetch room detail\n');
        }
        resolve();
      }, 100);
    });
  });

  // Test 4: Validation - invalid gender
  console.log('Test 4: Validation - invalid gender rejected');
  const socket3 = io(SERVER_URL, { transports: ['websocket'] });
  
  await new Promise((resolve) => {
    socket3.on('connect', () => {
      socket3.emit('join-room', {
        roomId: 'test-room-validation',
        userId: 'user-charlie',
        gender: 'invalid-gender',
        avatar: 1,
      }, (response) => {
        if (!response.success && response.error.includes('gender')) {
          console.log('✓ Invalid gender rejected:', response.error);
          console.log('✅ Test 4 PASSED: Gender validation works\n');
        } else {
          console.log('❌ Test 4 FAILED: Invalid gender not rejected\n');
        }
        resolve();
      });
    });
  });

  // Test 5: Validation - invalid avatar
  console.log('Test 5: Validation - invalid avatar rejected');
  
  await new Promise((resolve) => {
    socket3.emit('join-room', {
      roomId: 'test-room-validation',
      userId: 'user-charlie',
      gender: 'male',
      avatar: 999, // Out of range
    }, (response) => {
      if (!response.success && response.error.includes('avatar')) {
        console.log('✓ Invalid avatar rejected:', response.error);
        console.log('✅ Test 5 PASSED: Avatar validation works\n');
      } else {
        console.log('❌ Test 5 FAILED: Invalid avatar not rejected\n');
      }
      resolve();
    });
  });

  // Test 6: Null/optional profile fields
  console.log('Test 6: Null/optional profile fields');
  
  await new Promise((resolve) => {
    socket3.emit('join-room', {
      roomId: 'test-room-validation',
      userId: 'user-charlie',
      // No gender or avatar provided
    }, (response) => {
      if (response.success) {
        const charlie = response.users.find(u => u.userId === 'user-charlie');
        if (charlie && charlie.gender === null && charlie.avatar === null) {
          console.log('✓ Charlie joined with null profile:', {
            gender: charlie.gender,
            avatar: charlie.avatar,
          });
          console.log('✅ Test 6 PASSED: Null profile fields work\n');
        } else {
          console.log('❌ Test 6 FAILED: Null profile fields incorrect\n');
        }
      }
      resolve();
    });
  });

  // Cleanup
  socket1.disconnect();
  socket2.disconnect();
  socket3.disconnect();

  console.log('🎉 All tests completed!');
  process.exit(0);
}

testProfiles().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
