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
import { addMissingExpenseCategories } from "./actions";
import { AddDefaultCategories } from "@/components/money/add-default-categories";

export default async function ExpenseCategoriesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { baseCurrency: true },
  });

  const categories = await prisma.expenseCategory.findMany({
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
          Harcama Kategorileri
        </h1>
        <Link
          href="/expenses"
          className="text-accent-text text-[13px] font-semibold underline underline-offset-4"
        >
          Harcamalara dön
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kategoriler</CardTitle>
          <CardDescription>
            Artık kullanmadığın bir kategoriyi <strong>Gizle</strong> ile
            listelerden çıkarabilirsin; geçmiş kayıtların etiketi olduğu gibi
            kalır. <strong>Aylık limit</strong> sütunu Bütçeler sayfasındaki
            sınırın aynısı; ikisi de aynı değeri yazar. Tamamen silmek
            istersen kayıtlı harcaması olan kategoriyi de
            silebilirsin — silmeden önce kayıtları seçtiğin başka bir
            kategoriye taşır. Kredi taksitleri artık &quot;Krediler&quot;
            sekmesinde takip edildiği için burada ayrı bir kredi kategorisi
            tutmana gerek yok.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CategoryForm />
            <AddDefaultCategories action={addMissingExpenseCategories} />
          </div>
          <CategoryTable
            currency={user.baseCurrency}
            limits={Object.fromEntries(
              categories.map((c) => [
                c.id,
                c.monthlyLimit === null ? null : c.monthlyLimit.toString(),
              ])
            )}
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              isDefault: c.isDefault,
              archived: c.archived,
              entryCount: c._count.entries,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
