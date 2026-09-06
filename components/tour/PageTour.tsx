"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TOURS, tourKeyForPath } from "@/lib/tours/content";
import { completeTour } from "@/app/(app)/tour-actions";

/**
 * Sekmeye ilk kez girildiğinde açılan tanıtım penceresi.
 *
 * Hangi sayfada olunduğu yol adresinden bulunur; tamamlanan turlar kullanıcı
 * kaydında tutulduğu için tarayıcı ya da cihaz değişse de tekrar açılmaz.
 * Kapatma (X / dışarı tıklama) da tamamlama sayılır — kullanıcı görmek
 * istemiyorsa her girişte tekrar rahatsız edilmemeli.
 */
export function PageTour({ completedTours }: { completedTours: string[] }) {
  const pathname = usePathname();
  const tourKey = pathname ? tourKeyForPath(pathname) : null;

  // Sunucudan gelen liste sayfa yenilenene kadar tazelenmediğinden, bu
  // oturumda tamamlananları ayrıca tutuyoruz.
  const [doneInSession, setDoneInSession] = useState<string[]>([]);

  const tour = tourKey ? TOURS[tourKey] : null;
  const alreadySeen =
    !tourKey || completedTours.includes(tourKey) || doneInSession.includes(tourKey);

  if (!tour || alreadySeen) return null;

  // key ile sekme değişiminde bileşen sıfırdan kurulur; adım sayacını
  // effect içinde elle sıfırlamaya gerek kalmaz.
  return (
    <TourDialog
      key={tour.key}
      tour={tour}
      onFinish={(key) => setDoneInSession((prev) => [...prev, key])}
    />
  );
}

function TourDialog({
  tour,
  onFinish,
}: {
  tour: (typeof TOURS)[string];
  onFinish: (key: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [, startTransition] = useTransition();

  const current = tour.steps[step];
  const isLast = step === tour.steps.length - 1;

  function finish() {
    onFinish(tour.key);
    startTransition(async () => {
      await completeTour(tour.key);
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {tour.pageName} · {step + 1}/{tour.steps.length}
          </p>
          <DialogTitle className="text-xl">{current.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2.5 pt-1 text-left text-sm leading-relaxed">
              {current.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Adım göstergesi: kaç adım kaldığı bir bakışta görünsün. */}
        <div className="flex gap-1.5" aria-hidden>
          {tour.steps.map((_, i) => (
            <span
              key={i}
              className={
                i === step
                  ? "bg-primary h-1 flex-1 rounded-full"
                  : "bg-muted h-1 flex-1 rounded-full"
              }
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            Turu atla
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                Geri
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            >
              {isLast ? "Anladım" : "İleri"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
