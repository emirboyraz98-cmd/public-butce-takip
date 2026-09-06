"use client";

import { useState, useTransition } from "react";
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

export type CategoryRow = {
  id: string;
  name: string;
  isDefault: boolean;
  /** Bu kategoriye bağlı kayıt sayısı. */
  entryCount: number;
  /** Gizli kategoriler seçim listelerinde çıkmaz. */
  archived?: boolean;
};

type Result = { error?: string; success?: boolean };

/**
 * Gelir ve gider kategorilerinin ortak yönetim tablosu.
 *
 * Kayıtlı girişi olan bir kategori eskiden hiç silinemiyordu; artık kayıtlar
 * başka bir kategoriye taşınarak silinebiliyor. Böylece sonradan gereksiz
 * kalan bir kategori (örn. kredi taksitleri ayrı sekmeye taşındıktan sonra
 * kalan "Kredi Ödemesi") listeden temizlenebiliyor.
 */
export function CategoryManagerTable({
  categories,
  onDelete,
  onToggleArchive,
  entryNoun,
  limitCell,
}: {
  categories: CategoryRow[];
  onDelete: (id: string, moveToId?: string) => Promise<Result>;
  /**
   * Verilirse her satırda "Gizle"/"Göster" düğmesi çıkar. Gizlemek silmez:
   * kayıtların etiketi korunur, kategori yalnızca seçim listelerinden düşer.
   */
  onToggleArchive?: (id: string, archived: boolean) => Promise<Result>;
  /** "harcama" / "gelir" — mesajlarda kullanılır. */
  entryNoun: string;
  /**
   * Verilirse "Aylık limit" sütunu çıkar ve her satır için bu işlev
   * çağrılır. Yalnızca giderde anlamlı; gelire bütçe konmuyor, o yüzden
   * sütun tabloya gömülü değil dışarıdan veriliyor.
   */
  limitCell?: (categoryId: string) => React.ReactNode;
}) {
  const router = useRouter();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove(id: string, moveToId?: string) {
    startTransition(async () => {
      const result = await onDelete(id, moveToId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        moveToId ? "Kayıtlar taşındı, kategori silindi." : "Kategori silindi."
      );
      setMovingId(null);
      router.refresh();
    });
  }

  function toggleArchive(id: string, archived: boolean) {
    if (!onToggleArchive) return;
    startTransition(async () => {
      const result = await onToggleArchive(id, archived);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        archived
          ? "Kategori gizlendi; seçim listelerinde çıkmayacak."
          : "Kategori yeniden gösteriliyor."
      );
      router.refresh();
    });
  }

  return (
    <ScrollableTable rowCount={categories.length} newestFirst={false}>
      <TableHeader>
        <TableRow>
          <TableHead>Kategori</TableHead>
          <TableHead className="text-right">Kayıt</TableHead>
          {limitCell && <TableHead className="text-right">Aylık limit</TableHead>}
          <TableHead className="text-right">İşlem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categories.map((c) => (
          <TableRow key={c.id}>
            <TableCell className={c.archived ? "text-muted-foreground" : ""}>
              {c.name}
              {c.archived && (
                <span className="text-muted-foreground ml-2 text-xs">
                  (gizli)
                </span>
              )}
              {c.isDefault && !c.archived && (
                <span className="text-muted-foreground ml-2 text-xs">
                  (varsayılan)
                </span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-sm">
              {c.entryCount > 0 ? `${c.entryCount} ${entryNoun}` : "—"}
            </TableCell>
            {limitCell && (
              <TableCell className="text-right">{limitCell(c.id)}</TableCell>
            )}
            <TableCell className="text-right">
              {movingId === c.id ? (
                <MoveAndDelete
                  category={c}
                  others={categories.filter((o) => o.id !== c.id)}
                  entryNoun={entryNoun}
                  isPending={isPending}
                  onConfirm={(moveToId) => remove(c.id, moveToId)}
                  onCancel={() => setMovingId(null)}
                />
              ) : (
                <span className="space-x-1">
                  {onToggleArchive && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => toggleArchive(c.id, !c.archived)}
                    >
                      {c.archived ? "Göster" : "Gizle"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      c.entryCount > 0 ? setMovingId(c.id) : remove(c.id)
                    }
                  >
                    Sil
                  </Button>
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScrollableTable>
  );
}

function MoveAndDelete({
  category,
  others,
  entryNoun,
  isPending,
  onConfirm,
  onCancel,
}: {
  category: CategoryRow;
  others: CategoryRow[];
  entryNoun: string;
  isPending: boolean;
  onConfirm: (moveToId: string) => void;
  onCancel: () => void;
}) {
  // "Diğer" varsa varsayılan hedef odur; sınıflandırılamayan kayıtların
  // düşeceği yer zaten orası.
  const [target, setTarget] = useState(
    () => others.find((o) => o.name === "Diğer")?.id ?? others[0]?.id ?? ""
  );

  if (others.length === 0) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-muted-foreground text-xs">
          Taşınacak başka kategori yok
        </span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Vazgeç
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-muted-foreground text-xs">
        {category.entryCount} {entryNoun} şuraya taşınsın:
      </span>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="border-input bg-muted h-8 border px-2 text-sm"
        aria-label="Hedef kategori"
      >
        {others.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-8"
        disabled={isPending || !target}
        onClick={() => onConfirm(target)}
      >
        Taşı ve sil
      </Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={onCancel}>
        Vazgeç
      </Button>
    </div>
  );
}
