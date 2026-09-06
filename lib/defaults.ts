/**
 * Yeni kullanıcıya açılışta oluşturulan kategoriler.
 *
 * Liste sonradan genişletilebilir; mevcut kullanıcılar Kategoriler
 * sayfasındaki "Eksik varsayılanları ekle" düğmesiyle yenileri alır.
 * "Diğer" her zaman listede kalmalı — sınıflandırılamayan kayıtların
 * düşeceği yer odur.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Market",
  "Yeme-İçme",
  "Ulaşım",
  "Akaryakıt",
  "Kira",
  "Faturalar",
  "Aidat",
  "Sağlık",
  "Giyim",
  "Elektronik",
  "Eğitim",
  "Abonelikler",
  "Eğlence",
  "Tatil/Seyahat",
  "Hediye",
  "Bakım/Onarım",
  "Evcil Hayvan",
  "Vergi/Resmî Ödeme",
  "Sigorta",
  "Diğer",
];

export const DEFAULT_INCOME_CATEGORIES = [
  "Kira Geliri",
  "Prim",
  "Borsa Kâr Realizasyonu",
  "Freelance",
  "Temettü",
  "Faiz Geliri",
  "İkinci El Satış",
  "Hediye/Bağış",
  "İade",
  "Diğer",
];
