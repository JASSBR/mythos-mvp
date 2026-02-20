import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const password = await bcrypt.hash('Password123!', 10);

  // 1 Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mythos.fr' },
    update: {},
    create: {
      email: 'admin@mythos.fr',
      username: 'AdminMythos',
      passwordHash: password,
      role: 'ADMIN',
      stats: { create: { gamesPlayed: 0, gamesWon: 0, totalPlaytimeMin: 0 } },
    },
  });
  console.log(`  Admin created: ${admin.email} (${admin.id})`);

  // 5 Normal players
  const players = [
    { email: 'alice@mythos.fr', username: 'Alice' },
    { email: 'bob@mythos.fr', username: 'Bob' },
    { email: 'charlie@mythos.fr', username: 'Charlie' },
    { email: 'diana@mythos.fr', username: 'Diana' },
    { email: 'edgar@mythos.fr', username: 'Edgar' },
  ];

  for (const p of players) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        username: p.username,
        passwordHash: password,
        role: 'PLAYER',
        stats: { create: { gamesPlayed: 0, gamesWon: 0, totalPlaytimeMin: 0 } },
      },
    });
    console.log(`  Player created: ${user.email} (${user.id})`);
  }

  console.log('\nSeed complete!');
  console.log('All users have password: Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
