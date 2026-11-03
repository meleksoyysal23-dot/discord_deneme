import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  // Test hesap 1 - mevcut testuser1'i email ile güncelle
  const existingUser1 = await prisma.user.findUnique({
    where: { username: 'testuser1' },
  });

  if (existingUser1) {
    await prisma.user.update({
      where: { username: 'testuser1' },
      data: {
        email: 'test1@test.com',
        passwordHash, // Şifreyi 123456 olarak güncelle
      },
    });
    console.log('✅ testuser1 güncellendi: test1@test.com / 123456');
  } else {
    await prisma.user.create({
      data: {
        username: 'testuser1',
        email: 'test1@test.com',
        passwordHash,
        discriminator: '0001',
        displayName: 'Test User 1',
        status: 'ONLINE',
      },
    });
    console.log('✅ testuser1 oluşturuldu: test1@test.com / 123456');
  }

  // Test hesap 2 - mevcut testuser2'yi email ile güncelle
  const existingUser2 = await prisma.user.findUnique({
    where: { username: 'testuser2' },
  });

  if (existingUser2) {
    await prisma.user.update({
      where: { username: 'testuser2' },
      data: {
        email: 'test2@test.com',
        passwordHash, // Şifreyi 123456 olarak güncelle
      },
    });
    console.log('✅ testuser2 güncellendi: test2@test.com / 123456');
  } else {
    await prisma.user.create({
      data: {
        username: 'testuser2',
        email: 'test2@test.com',
        passwordHash,
        discriminator: '0002',
        displayName: 'Test User 2',
        status: 'ONLINE',
      },
    });
    console.log('✅ testuser2 oluşturuldu: test2@test.com / 123456');
  }

  console.log('\n📋 Test hesapları:');
  console.log('  - test1@test.com / 123456');
  console.log('  - test2@test.com / 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
