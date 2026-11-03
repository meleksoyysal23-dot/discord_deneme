const BASE = 'http://localhost:3001/api/auth';

async function test(name, url, body) {
  console.log(`\n=== ${name} ===`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch (err) {
    console.log('ERROR:', err.message);
    return { status: 0, data: null };
  }
}

async function main() {
  // Test 1: Login with email
  await test(
    'Login with email (test1@test.com)',
    `${BASE}/login`,
    { identifier: 'test1@test.com', password: '123456' }
  );

  // Test 2: Login with username (backward compatibility)
  await test(
    'Login with username (testuser1)',
    `${BASE}/login`,
    { username: 'testuser1', password: '123456' }
  );

  // Test 3: Login with wrong password
  await test(
    'Login with wrong password',
    `${BASE}/login`,
    { identifier: 'test1@test.com', password: 'wrongpassword' }
  );

  // Test 4: Login with non-existent email
  await test(
    'Login with non-existent email',
    `${BASE}/login`,
    { identifier: 'nobody@test.com', password: '123456' }
  );

  // Test 5: Register with email
  await test(
    'Register new user with email',
    `${BASE}/register`,
    { username: 'emailuser_test', password: '123456', email: 'newuser@test.com' }
  );
}

main().catch(console.error);
