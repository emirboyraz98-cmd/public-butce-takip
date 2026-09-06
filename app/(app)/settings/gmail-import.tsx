"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { createImportToken, revokeImportToken } from "./import-token-actions";

export type TokenRow = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

/**
 * Apps Script kodu — kullanıcının kendi Gmail hesabında çalışır.
 *
 * Uygulamanın Gmail'e doğrudan bağlanmaması bilinçli: Gmail okuma izni
 * Google'ın "kısıtlı kapsam"ı ve yayınlanmış bir uygulama için güvenlik
 * denetimi gerektiriyor. Script kullanıcının hesabında çalıştığından o
 * denetim gerekmiyor ve uygulama hiçbir Google kimlik bilgisi saklamıyor.
 *
 * İlk çalıştırma hiçbir şey aktarmaz, yalnızca "şu andan itibaren"
 * damgasını atar — kullanıcı geçmişin toptan içeri akmasını istemiyor.
 * Zaman damgası yine de yalnızca hızlandırma: doğruluk sunucudaki
 * tekilleştirmeden geliyor, aynı mail iki kez gönderilse de tek kayıt olur.
 */
function scriptSource(endpoint: string, token: string, label: string) {
  return `const ADRES  = "${endpoint}";
const ANAHTAR = "${token}";
const ETIKET  = "${label}";

function aktar() {
  const ayarlar = PropertiesService.getScriptProperties();
  const sonCalisma = Number(ayarlar.getProperty("sonCalisma") || 0);

  // İlk çalıştırmada geçmişe gidilmez; sadece bundan sonrası aktarılır.
  if (!sonCalisma) {
    ayarlar.setProperty("sonCalisma", String(Date.now()));
    return;
  }

  const etiket = GmailApp.getUserLabelByName(ETIKET);
  if (!etiket) throw new Error("Gmail'de böyle bir etiket yok: " + ETIKET);

  const mesajlar = [];
  for (const konu of etiket.getThreads(0, 100)) {
    for (const mesaj of konu.getMessages()) {
      if (mesaj.getDate().getTime() <= sonCalisma) continue;
      mesajlar.push({
        id: mesaj.getId(),
        subject: mesaj.getSubject(),
        from: mesaj.getFrom(),
        date: mesaj.getDate().toISOString(),
        body: mesaj.getPlainBody().slice(0, 20000),
      });
    }
  }

  // Yeni mail yoksa bile bir kez yoklama gönderilir; yoksa kurulumun
  // çalıştığı ancak ilk harcamada anlaşılırdı.
  const partiler = mesajlar.length ? [] : [[]];
  for (let i = 0; i < mesajlar.length; i += 50) partiler.push(mesajlar.slice(i, i + 50));

  for (const parti of partiler) {
    const yanit = UrlFetchApp.fetch(ADRES, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + ANAHTAR },
      payload: JSON.stringify({ messages: parti }),
      muteHttpExceptions: true,
    });
    // Hata durumunda zaman damgası ilerlemesin, sonraki koşuda tekrar denensin.
    if (yanit.getResponseCode() !== 200) {
      throw new Error("Aktarım başarısız (" + yanit.getResponseCode() + "): " + yanit.getContentText());
    }
  }

  ayarlar.setProperty("sonCalisma", String(Date.now()));
  console.log(mesajlar.length + " mesaj gönderildi.");
}

// Kurulumu sınamak için: en son Akbank mailini zaman damgasına bakmadan
// gönderir ve sunucunun cevabını yazar. Tekrar gönderilse de yeni kayıt
// açılmaz (tekilleştirme mesaj kimliğine bağlı), o yüzden zararsızdır.
function dene() {
  const etiket = GmailApp.getUserLabelByName(ETIKET);
  if (!etiket) throw new Error("Gmail'de böyle bir etiket yok: " + ETIKET);

  const konular = etiket.getThreads(0, 1);
  const mesajlar = konular.length ? konular[0].getMessages().slice(-1) : [];

  const yanit = UrlFetchApp.fetch(ADRES, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ANAHTAR },
    payload: JSON.stringify({
      messages: mesajlar.map((mesaj) => ({
        id: mesaj.getId(),
        subject: mesaj.getSubject(),
        from: mesaj.getFrom(),
        date: mesaj.getDate().toISOString(),
        body: mesaj.getPlainBody().slice(0, 20000),
      })),
    }),
    muteHttpExceptions: true,
  });

  console.log("HTTP " + yanit.getResponseCode() + " — " + yanit.getContentText());
}

// Bir kez çalıştır: 10 dakikada bir tetikleyici kurar ve başlangıç anını damgalar.
function kur() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("aktar").timeBased().everyMinutes(10).create();
  PropertiesService.getScriptProperties().setProperty("sonCalisma", String(Date.now()));
  console.log("Kuruldu. Bundan sonraki harcamalar otomatik aktarılacak.");
}`;
}

/**
 * Apps Script proje ayarları (`appsscript.json`).
 *
 * Apps Script izinleri otomatik belirlerken kullanılan SINIFA bakıyor,
 * çağrılan metotlara değil. `GmailApp` sınıfında silme ve gönderme de
 * olduğu için, yalnızca okuyan bir script'e bile "tüm e-postalarınızı
 * okuma, gönderme ve kalıcı olarak silme" izni isteniyor.
 *
 * Kapsamı burada açıkça yazınca Google yalnızca istenenleri soruyor:
 *   gmail.readonly            → mailleri okumak (silme/gönderme YOK)
 *   script.external_request   → UrlFetchApp ile uygulamaya göndermek
 *   script.scriptapp          → 10 dakikalık tetikleyiciyi kurmak
 *
 * PropertiesService ayrı bir izin istemiyor; script'in kendi içinde kalıyor.
 */
const MANIFEST = `{
  "timeZone": "Europe/Istanbul",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}`;

function CopyBox({
  text,
  rows = 3,
  fileName,
}: {
  text: string;
  rows?: number;
  /**
   * Metnin gideceği dosya. Kutunun üstünde ayrı bir başlık olarak
   * durduğunda gözden kaçıyor ve iki kutu birbirine karışıyordu: JSON
   * manifest Kod.gs'e yapıştırılınca Apps Script sözdizimi hatası
   * veriyor. Ad artık kutunun kendi çerçevesinde, sekme gibi.
   */
  fileName?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <div className="border-border overflow-hidden border">
        {fileName && (
          <div className="border-border bg-muted text-muted-foreground border-b px-2 py-1 font-mono text-xs">
            {fileName}
          </div>
        )}
        <textarea
          readOnly
          rows={rows}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          className="bg-muted/40 w-full p-2 font-mono text-xs outline-none"
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Pano izni yoksa metin zaten seçilebilir durumda.
            toast.info("Kopyalanamadı; kutudaki metni elle seç.");
          }
        }}
      >
        {copied ? "Kopyalandı" : "Kopyala"}
      </Button>
    </div>
  );
}

export function GmailImport({
  tokens,
  baseUrl,
}: {
  tokens: TokenRow[];
  /** Uygulamanın kendi adresi; sunucuda istek başlığından okunuyor. */
  baseUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [gmailLabel, setGmailLabel] = useState("Akbank");
  const [fresh, setFresh] = useState<string | null>(null);

  // Adres, sayfanın geldiği isteğin kendisinden türetiliyor — ayrı bir ortam
  // değişkenine bağlamak, yerelde ve canlıda farklı adres üreten bir ayar
  // hatasını sessizce taşırdı.
  const endpoint = `${baseUrl}/api/import/akbank`;

  return (
    <div className="space-y-5 text-sm">
      <p className="text-muted-foreground">
        Bankanın kart harcama maillerini otomatik olarak{" "}
        <strong>Kredi Kartı</strong> sekmesine düşürür. Gmail hesabında çalışan
        küçük bir script 10 dakikada bir yeni mailleri buraya gönderir; kayıtlar
        doğrudan listeye eklenmez, önce <strong>onay kutusuna</strong> düşer.
        Uygulama Gmail&apos;e bağlanmaz, hiçbir Google şifresi ya da izni
        saklanmaz.
      </p>

      <div className="space-y-2">
        <p className="font-medium">1. Anahtar üret</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ad (isteğe bağlı): örn. Telefon Gmail"
            className="h-9 w-64"
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await createImportToken(label);
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                setFresh(result.plaintext ?? null);
                setLabel("");
                router.refresh();
              })
            }
          >
            Yeni anahtar üret
          </Button>
        </div>

        {fresh && (
          <div className="border-primary/40 bg-primary/5 space-y-2 border p-3">
            <p className="font-medium">
              Anahtarın hazır — bu bir daha gösterilmeyecek.
            </p>
            <CopyBox text={fresh} rows={2} />
          </div>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="space-y-2">
          <p className="font-medium">Etkin anahtarlar</p>
          <ul className="space-y-1">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 border px-3 py-2"
              >
                <span>
                  {t.label ?? "Adsız"}{" "}
                  <span className="text-muted-foreground text-xs">
                    · {formatDate(t.createdAt)} tarihinde üretildi ·{" "}
                    {t.lastUsedAt
                      ? `son kullanım ${formatDate(t.lastUsedAt)}`
                      : "henüz kullanılmadı"}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await revokeImportToken(t.id);
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Anahtar iptal edildi.");
                      router.refresh();
                    })
                  }
                >
                  İptal et
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="font-medium">2. Gmail etiketinin adı</p>
        <Input
          value={gmailLabel}
          onChange={(e) => setGmailLabel(e.target.value)}
          className="h-9 w-64"
        />
        <p className="text-muted-foreground text-xs">
          Banka maillerini topladığın etiket. Gmail&apos;de göründüğü gibi yaz
          (büyük/küçük harf önemli).
        </p>
      </div>

      <div className="space-y-2">
        <p className="font-medium">3. Script&apos;i kur</p>
        <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
          <li>
            <a
              href="https://script.google.com/home/projects/create"
              target="_blank"
              rel="noreferrer"
              className="text-accent-text underline underline-offset-4"
            >
              script.google.com
            </a>{" "}
            adresinde yeni bir proje aç.
          </li>
          <li>
            Sol taraftaki <strong>⚙ Proje Ayarları</strong> →{" "}
            <strong>
              &quot;appsscript.json bildirim dosyasını editörde göster&quot;
            </strong>{" "}
            kutusunu işaretle.
          </li>
          <li>
            <strong>Düzenleyici</strong>&apos;ye dön,{" "}
            <code>appsscript.json</code> dosyasını aç, içindekini silip{" "}
            <strong>aşağıdaki ilk kutuyu</strong> yapıştır ve kaydet.
          </li>
          <li>
            <code>Kod.gs</code> dosyasına geç, içindekini silip{" "}
            <strong>ikinci kutuyu</strong> yapıştır ve kaydet.
          </li>
          <li>
            Üstteki fonksiyon listesinden <strong>kur</strong>&apos;u seçip
            çalıştır. Google izin soracak; ekranda{" "}
            <strong>yalnızca &quot;görüntüleme&quot;</strong> yazmalı, gönderme
            ya da silme geçmemeli.
          </li>
          <li>
            Aynı listeden <strong>dene</strong>&apos;yi çalıştır.{" "}
            <code>HTTP 200</code> görüyorsan bitti — 10 dakikada bir yeni
            harcamalar onay kutusuna düşer.
          </li>
        </ol>

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            Bu dosya olmadan Apps Script, script sadece okuduğu hâlde{" "}
            <strong>gönderme ve silme</strong> iznini de ister; kapsamı
            belirlerken çağrılan metotlara değil kullanılan sınıfa bakıyor.
            Dosyayı <em>kur&apos;u çalıştırmadan önce</em> kaydet — izin bir
            kez verildikten sonra daraltmak, izni Google hesabından geri çekip
            yeniden vermeyi gerektirir.
          </p>
          <CopyBox rows={11} text={MANIFEST} fileName="appsscript.json" />
        </div>

        <div className="space-y-1">
          <CopyBox
            rows={14}
            fileName="Kod.gs"
            text={scriptSource(
              endpoint,
              fresh ?? "BURAYA_ANAHTARI_YAPISTIR",
              gmailLabel || "Akbank"
            )}
          />
          {!fresh && (
            <p className="text-destructive text-xs">
              Bu kodda anahtar yerine <code>BURAYA_ANAHTARI_YAPISTIR</code>{" "}
              yazıyor — böyle yapıştırırsan script <code>401</code> alır. Önce
              yukarıdan <strong>anahtar üret</strong>, kutu kendiliğinden
              dolsun.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
