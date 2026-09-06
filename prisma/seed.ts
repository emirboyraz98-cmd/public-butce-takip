import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { BUILT_IN_HOLIDAYS } from "../lib/salary/publicHolidays";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const deduped = new Map(BUILT_IN_HOLIDAYS.map((h) => [h.date, h.name]));

  for (const [date, name] of deduped) {
    await prisma.publicHoliday.upsert({
      where: { date: new Date(`${date}T00:00:00Z`) },
      create: { date: new Date(`${date}T00:00:00Z`), name },
      update: { name },
    });
  }

  console.log(`Seed: ${deduped.size} resmi tatil kaydı eklendi/güncellendi.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
