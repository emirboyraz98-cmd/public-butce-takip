import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryForm } from "./category-form";
import { CategoryTable } from "./category-table";
import { addMissingIncomeCategories } from "./actions";
import { AddDefaultCategories } from "@/components/money/add-default-categories";

export default async function IncomeCategoriesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const categories = await prisma.incomeCategory.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    // Kayıt sayısı tabloda gösterilir; silmeden önce kaç kaydın taşınacağı
    // bilinsin diye.
    include: { _count: { select: { entries: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.02em] sm:text-[30px]">
          Gelir Kategorileri
        </h1>
        <Link
          href="/income"
          className="text-accent-text text-[13px] font-semibold underline underline-offset-4"
        >
          Gelirlere dön
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kategoriler</CardTitle>
          <CardDescription>
            Kayıtlı geliri olan bir kategori silinemez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CategoryForm />
            <AddDefaultCategories action={addMissingIncomeCategories} />
          </div>
          <CategoryTable
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              isDefault: c.isDefault,
              entryCount: c._count.entries,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
