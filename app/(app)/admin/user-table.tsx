"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { formatDate } from "@/lib/format";
import { approveUser, disableUser, rejectUser } from "./actions";

export type AdminUserRow = {
  id: string;
  name: string | null;
  username: string;
  role: "USER" | "ADMIN";
  status: "PENDING" | "ACTIVE" | "DISABLED";
  /** yyyy-MM-dd */
  createdAt: string;
  isSelf: boolean;
};

const STATUS_LABEL: Record<AdminUserRow["status"], string> = {
  PENDING: "Onay bekliyor",
  ACTIVE: "Aktif",
  DISABLED: "Devre dışı",
};

const STATUS_STYLE: Record<AdminUserRow["status"], string> = {
  PENDING: "border-destructive/50 text-destructive",
  ACTIVE: "border-transparent bg-muted",
  DISABLED: "text-muted-foreground border-dashed",
};

export function AdminUserTable({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>, done: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });

  if (users.length === 0) {
    return <p className="text-muted-foreground text-sm">Henüz üye yok.</p>;
  }

  return (
    <ScrollableTable rowCount={users.length} newestFirst={false}>
      <TableHeader>
        <TableRow>
          <TableHead>Üye</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead className="hidden sm:table-cell">Kayıt</TableHead>
          <TableHead className="text-right">İşlem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow key={u.id}>
            <TableCell>
              <span className="font-medium">{u.name ?? "—"}</span>
              <span className="text-muted-foreground block text-xs">
                @{u.username}
                {u.role === "ADMIN" && " · yönetici"}
                {u.isSelf && " · sen"}
              </span>
            </TableCell>
            <TableCell>
              <span
                className={`border px-1.5 py-0.5 text-xs ${STATUS_STYLE[u.status]}`}
              >
                {STATUS_LABEL[u.status]}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground hidden sm:table-cell">
              {formatDate(u.createdAt)}
            </TableCell>
            <TableCell className="space-x-1 text-right">
              {u.isSelf ? (
                <span className="text-muted-foreground text-xs">—</span>
              ) : (
                <>
                  {u.status !== "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        run(() => approveUser(u.id), "Üyelik açıldı")
                      }
                    >
                      {u.status === "PENDING" ? "Onayla" : "Yeniden aç"}
                    </Button>
                  )}
                  {u.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() =>
                        run(() => disableUser(u.id), "Üyelik devre dışı")
                      }
                    >
                      Devre dışı bırak
                    </Button>
                  )}
                  {u.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() =>
                        run(() => rejectUser(u.id), "Kayıt silindi")
                      }
                    >
                      Reddet
                    </Button>
                  )}
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScrollableTable>
  );
}
