import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import type Decimal from "decimal.js";

import { prisma } from "@/lib/prisma";
import { parseAkbankEmail, suggestCategory } from "@/lib/import/akbank";
import { buildImportRow } from "@/lib/import/ingest";
import { rateToBase } from "@/lib/import/fxRate";
import {
  parseAuthorizationHeader,
  secretMatchesHash,
} from "@/lib/import/token";

// node:crypto ve Prisma kullanılıyor; Edge çalışma zamanında ikisi de yok.
export const runtime = "nodejs";

/**
 * Gmail'de çalışan Apps Script'in yeni Akbank maillerini bıraktığı uç nokta.
 *
 * Neden POST ile dışarıdan besleniyor da uygulama Gmail'e kendisi bağlanmıyor:
 * Gmail okuma izni Google'ın "kısıtlı kapsam"ı, yayınlanmış bir uygulama için
 * güvenlik denetimi gerektiriyor. Script kullanıcının kendi hesabında
 * çalıştığı için o denetim gerekmiyor ve uygulama hiçbir Google kimlik
 * bilgisi saklamıyor.
 *
 * Uç nokta internete açık olduğundan güvence tek katman değil:
 *   - kullanıcı başına anahtar (özet olarak saklanır, sabit zamanlı doğrulanır)
 *   - gönderen adresi doğrulaması (bilgi.akbank.com)
 *   - istek başına mesaj sayısı ve gövde uzunluğu sınırı
 *   - kayıtlar doğrudan gider olmuyor; onay kutusuna PENDING düşüyor
 */
const MAX_MESSAGES = 50;
const MAX_BODY_CHARS = 20_000;

const messageSchema = z.object({
  /** Gmail message id — tekilleştirmenin dayanağı. */
  id: z.string().min(1).max(120),
  subject: z.string().max(500),
  from: z.string().max(320),
  /** RFC3339 / ISO 8601. */
  date: z.string().min(1),
  body: z.string().max(MAX_BODY_CHARS),
});

const payloadSchema = z.object({
  /**
   * Boş liste kabul edilir ve "yoklama" anlamına gelir: hiçbir şey
   * yazmadan anahtarın son kullanım damgasını günceller. Kurulumdan hemen
   * sonra genelde yeni harcama olmuyor; istek hiç atılmasaydı kullanıcı
   * bağlantının kurulup kurulmadığını ancak günler sonra, ilk harcamada
   * öğrenirdi.
   */
  messages: z.array(messageSchema).max(MAX_MESSAGES),
});

type Skipped = { id: string; reason: string };

export async function POST(request: Request) {
  // "Başlık hiç yok" ile "başlık var ama biçimi bozuk" ayrı hatalar: ikisine
  // de "Anahtar yok" demek, kurulumda anahtarı yapıştırmayı unutan kullanıcıyı
  // yanlış yere baktırıyordu (script gönderiyor ama yer tutucuyu gönderiyor).
  const header = request.headers.get("authorization");
  if (!header) {
    return NextResponse.json({ error: "Anahtar yok" }, { status: 401 });
  }

  const auth = parseAuthorizationHeader(header);
  if (!auth) {
    return NextResponse.json(
      {
        error:
          "Anahtar biçimi geçersiz. Ayarlar'dan yeni bir anahtar üretip Kod.gs içindeki ANAHTAR satırını güncelle.",
      },
      { status: 401 }
    );
  }

  const token = await prisma.importToken.findUnique({
    where: { id: auth.tokenId },
    select: {
      id: true,
      secretHash: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          status: true,
          baseCurrency: true,
          creditCardStatementDay: true,
        },
      },
    },
  });

  if (
    !token ||
    token.revokedAt !== null ||
    !secretMatchesHash(auth.secret, token.secretHash)
  ) {
    return NextResponse.json({ error: "Anahtar geçersiz" }, { status: 401 });
  }

  // Askıya alınmış/onay bekleyen hesap veri yazamamalı; oturum açamayan bir
  // kullanıcının anahtarla arka kapıdan içeri kayıt sokması tuhaf olurdu.
  if (token.user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Hesap etkin değil" }, { status: 403 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  const user = token.user;
  const baseCurrency = user.baseCurrency;
  const skipped: Skipped[] = [];

  // Kategori adları kullanıcıya ait; sektör eşlemesi ad üretiyor, burada
  // kimliğe çevriliyor. Kullanıcı kategoriyi silmiş/yeniden adlandırmışsa
  // öneri boş kalır ve onay kutusunda seçilir.
  const categories = await prisma.expenseCategory.findMany({
    where: { userId: user.id, archived: false },
    select: { id: true, name: true },
  });
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  // Aynı istekte tekrar eden para birimleri için kur bir kez alınır.
  const rateCache = new Map<string, Decimal | null>();
  const getRate = async (currency: string) => {
    if (!rateCache.has(currency)) {
      rateCache.set(currency, await rateToBase(currency, baseCurrency));
    }
    return rateCache.get(currency) ?? null;
  };

  const rows: Prisma.ImportedTransactionCreateManyInput[] = [];

  for (const message of payload.messages) {
    const receivedAt = new Date(message.date);
    if (Number.isNaN(receivedAt.getTime())) {
      skipped.push({ id: message.id, reason: "Tarih okunamadı" });
      continue;
    }

    const result = parseAkbankEmail({
      subject: message.subject,
      body: message.body,
      from: message.from,
    });
    if (!result.ok) {
      skipped.push({ id: message.id, reason: result.reason });
      continue;
    }

    const transaction = result.transaction;
    const row = buildImportRow(message.id, {
      transaction,
      receivedAt,
      baseCurrency,
      statementDay: user.creditCardStatementDay,
      fxRate: await getRate(transaction.currency),
    });

    rows.push({
      userId: user.id,
      externalId: row.externalId,
      occurredAt: row.occurredAt,
      rawAmount: row.rawAmount,
      rawCurrency: row.rawCurrency,
      amount: row.amount,
      currency: row.currency,
      fxRate: row.fxRate,
      sector: row.sector,
      cardLast4: row.cardLast4,
      installmentCount: row.installmentCount,
      kind: row.kind,
      paymentMonth: row.paymentMonth,
      suggestedCategoryId:
        categoryIdByName.get(suggestCategory(row.sector)) ?? null,
    });
  }

  // `createMany` + `skipDuplicates` tek sorguda tekilleştiriyor, ama kaçının
  // yeni kaçının tekrar olduğunu saymıyor. Sayıyı ayrıca bildirmek gerekiyor:
  // "hiçbir şey aktarılmadı" ile "hepsi zaten vardı" farklı durumlar ve
  // kurulumun çalışıp çalışmadığı ancak bu ayrımla anlaşılıyor.
  const created = await prisma.importedTransaction.createMany({
    data: rows,
    skipDuplicates: true,
  });

  // Bağlantının çalıştığının tek görünür kanıtı bu: Ayarlar sayfasında
  // "son kullanım" boş kalıyorsa script hiç ulaşamamış demektir. Kayıt
  // yazılmasa bile damgalanır — "geldi ama hepsi tekrardı" da bir bilgi.
  await prisma.importToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  });

  return NextResponse.json({
    imported: created.count,
    duplicates: rows.length - created.count,
    skipped,
  });
}
