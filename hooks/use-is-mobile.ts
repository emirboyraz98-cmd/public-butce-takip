"use client";

import { useEffect, useState } from "react";

/** Tailwind'in `sm` kırılma noktası. */
const MOBILE_MAX_WIDTH = 639;

/**
 * Dar ekran mı?
 *
 * Yalnızca CSS ile çözülemeyen yerlerde kullanılır: grafik kütüphanesine
 * geçirilen sayısal ayarlar (etiket aralığı, yarıçap, açı) sınıf adlarıyla
 * değiştirilemiyor. Düzen işi CSS'te kalır.
 *
 * Sunucuda ve ilk render'da `false` döner; böylece sunucu çıktısıyla istemci
 * çıktısı uyuşur ve hydration uyarısı çıkmaz. Gerçek değer ilk efektte
 * yerine oturur.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}
