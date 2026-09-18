import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Ensures the admin account exists, from ADMIN_USERNAME / ADMIN_PASSWORD /
 * ADMIN_EMAIL / ADMIN_NAME. Idempotent: an existing admin is left as it is -
 * the password is only written when the account is first created, or when
 * ADMIN_FORCE_PASSWORD=true (to reset a lost one).
 */
async function main() {
  const prisma = new PrismaClient();
  const username = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
  const email = (process.env.ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'onpar';
  const name = process.env.ADMIN_NAME ?? 'Admin';
  const force = process.env.ADMIN_FORCE_PASSWORD === 'true';

  const existing =
    (await prisma.user.findUnique({ where: { username } })) ??
    (await prisma.user.findUnique({ where: { email } }));

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        username,
        role: 'admin',
        isActive: true,
        ...(force ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
    });
    console.log(`Admin "${username}" already exists${force ? ' - password reset from ADMIN_PASSWORD' : ''}.`);
  } else {
    await prisma.user.create({
      data: { username, email, name, role: 'admin', passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`Created admin "${username}" (${email}).`);
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
