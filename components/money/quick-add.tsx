"use client";

import { useEffect, useState } from "react";

import { createExpense } from "@/app/(app)/expenses/actions";
import {
  RecordDialog,
  type CategoryOption,
  type RecordValues,
} from "./record-dialog";

/**
 * Her sayfadan gider ekleme.
 *
 * Kayıt eklemek için önce doğru sekmeye gitmek gerekiyordu: Genel Bakış'ta
 * aklına gelen bir harcamayı yazmak için Giderler'e geçip "Gider ekle"
 * demek gerekiyordu ve bu, günlük kullanımdaki en sık işi en uzun yol
 * yapıyordu.
 *
 * Yalnızca GİDER ekliyor. Gelir ve yatırım seyrek girilen kayıtlar; üçünü
 * birden koymak düğmeyi bir menüye çevirip hızlı olma amacını bozardı.
 */
export function QuickAdd({ categories }: { categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);

  /*
   * Klavye kısayolu. Cmd/Ctrl+K tarayıcıda ve editörlerde "ara" anlamına
   * geldiği için kullanılmadı; Cmd/Ctrl+E boşta ve "ekle"yi çağrıştırıyor.
   * Bir alana yazarken kısayol çalışmıyor: yazının ortasında iletişim
   * kutusu açılması, kısayolu bilmeyene hata gibi görünürdü.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "e") return;
      const el = document.activeElement;
      const yaziyor =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (yaziyor) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit(values: RecordValues) {
    const fd = new FormData();
    fd.set("categoryId", values.categoryId);
    fd.set("amount", values.amount);
    fd.set("currency", values.currency);
    if (values.note) fd.set("note", values.note);
    fd.set("date", values.date);
    fd.set("frequency", values.frequency);
    if (values.frequency === "MONTHLY" && values.recurrenceEndMonth) {
      fd.set("recurrenceEndMonth", values.recurrenceEndMonth);
    }
    fd.set("kind", "OTHER");
    return createExpense({}, fd);
  }

  if (categories.length === 0) return null;

  return (
    <>
      {/*
        Telefonda alt sekme çubuğunun üstünde duruyor (bottom-20), masaüstünde
        sağ altta. Sabit konum: sayfa kaydırıldığında da erişilebilir olması
        hızlı olmasının şartı.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Hızlı gider ekle (Ctrl+E)"
        className="bg-primary text-primary-foreground focus-visible:outline-foreground fixed right-4 bottom-20 z-40 flex min-h-12 items-center gap-2 px-4 text-[14px] font-bold shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 lg:right-6 lg:bottom-6"
      >
        <span aria-hidden className="text-[18px] leading-none">
          +
        </span>
        Hızlı ekle
      </button>

      <RecordDialog
        open={open}
        onOpenChange={setOpen}
        kind="cash"
        categories={categories}
        onSubmit={submit}
      />
    </>
  );
}
