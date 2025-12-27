import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";

async function main() {
  const email = "admin@example.com";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`Admin user already exists with id=${existing.id}`);
    return;
  }

  const passwordHash = await hashPassword("adminpassword");
  const admin = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`Admin user created with id=${admin.id}`);
}

main()
  .catch((err) => {
    console.error("Failed to seed admin", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
