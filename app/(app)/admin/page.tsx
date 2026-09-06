import { notFound } from "next/navigation";
import { format } from "date-fns";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/requireAdmin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminUserTable } from "./user-table";

export default async function AdminPage() {
  // Yetkisiz kullanıcıya "burada bir yönetim sayfası var" bilgisi bile
  // verilmez; sayfa hiç yokmuş gibi davranır.
  if (!(await isAdmin())) notFound();

  const session = await auth();

  const users = await prisma.user.findMany({
    // Sadece kimlik ve durum. Tutar, kategori, kayıt sayısı — hiçbir finansal
    // alan seçilmiyor. Yönetim paneli "kim girebilir" sorusunu çözer,
    // "kim ne harcamış" sorusunu değil.
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      status: true,
      createdAt: true,
    },
    // Önce onay bekleyenler: sayfanın asıl işi o kuyruk.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const pendingCount = users.filter((u) => u.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Üye Yönetimi</h1>

      {pendingCount > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>
              {pendingCount} kayıt onay bekliyor
            </CardTitle>
            <CardDescription>
              Onaylanana kadar bu kişiler giriş yapamaz.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Üyeler</CardTitle>
          <CardDescription>
            Bu sayfa yalnızca kimlik ve üyelik durumunu gösterir — kimsenin
            tutarlarını, kategorilerini veya kayıtlarını göremezsin.
            &quot;Devre dışı bırak&quot; erişimi keser ama veriyi silmez;
            hesabı silmek o kişinin bütün verisini de siler, o yüzden yalnızca
            henüz onaylanmamış kayıtlar silinebilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminUserTable
            users={users.map((u) => ({
              id: u.id,
              name: u.name,
              username: u.username,
              role: u.role,
              status: u.status,
              createdAt: format(u.createdAt, "yyyy-MM-dd"),
              isSelf: u.id === session?.user?.id,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
