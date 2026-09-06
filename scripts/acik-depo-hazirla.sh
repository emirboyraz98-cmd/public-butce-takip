#!/usr/bin/env bash
#
# Bu depodan, herkese açık paylaşıma uygun TEMİZ bir anlık görüntü üretir.
#
# Neden kopya: mevcut depoyu public'e çevirmek 100+ commit'i, dal isimlerini
# ve her commit'teki yazar e-postasını da açar. Burada tek commit'lik yeni bir
# geçmiş kuruluyor; kod aynı, geliştirme süreci dışarıda kalıyor.
#
# Kullanım:
#   scripts/acik-depo-hazirla.sh [hedef-dizin]
#
# Sonrasında betiğin yazdırdığı iki komutla GitHub'a gönderilir.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
HEDEF="${1:-/tmp/butce-takip-acik}"

# Açık depoya GİRMEYECEK yollar.
#   .agents, .claude, skills-lock.json  -> üçüncü taraf ajan "skill" dokümanları;
#                                          bize ait değil, uygulamayı da ilgilendirmiyor
#   Website redesign project            -> tasarım aracının çıktısı; içinde özel
#                                          depo/dal adları ve üçüncü taraf paket var
DISLANAN=(
  ".agents"
  ".claude"
  "skills-lock.json"
  "Website redesign project"
)

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "HATA: çalışma ağacı temiz değil. Önce commit'le ya da stash'le." >&2
  exit 1
fi

rm -rf "$HEDEF"
mkdir -p "$HEDEF"

# Yalnızca git'in TAKİP ETTİĞİ dosyalar kopyalanır: .env, .next, node_modules
# gibi her şey böylece kendiliğinden dışarıda kalır.
git archive HEAD | tar -x -C "$HEDEF"

for yol in "${DISLANAN[@]}"; do
  rm -rf "${HEDEF:?}/${yol}"
done

# Son kontrol: sır kalıbı kalmış mı? Tarama başarısız olursa paket üretilmez.
if grep -rIlE "(postgresql://[^\"' ]*:[^\"' ]*@|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)" \
     "$HEDEF" 2>/dev/null | grep -v "\.env\.example$" | head -1 | grep -q .; then
  echo "HATA: pakette sır kalıbı bulundu, üretim durduruldu:" >&2
  grep -rIlE "(postgresql://[^\"' ]*:[^\"' ]*@|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)" \
    "$HEDEF" 2>/dev/null | grep -v "\.env\.example$" >&2
  exit 1
fi

if [[ ! -f "$HEDEF/.env.example" ]]; then
  echo "HATA: .env.example pakete girmemiş; kuran kişi hangi değişkenlerin" >&2
  echo "      gerektiğini bilemez. .gitignore'daki '!.env.example' satırını kontrol et." >&2
  exit 1
fi

cd "$HEDEF"
git init -q -b main
git add -A

# Tek commit'in yazarı. Varsayılan bu depodaki git kimliğin; e-postan public
# depoda görünsün istemiyorsan GitHub'ın noreply adresiyle çalıştır:
#   GIT_AUTHOR_EMAIL="12345678+kullanici@users.noreply.github.com" \
#     scripts/acik-depo-hazirla.sh
YAZAR_AD="${GIT_AUTHOR_NAME:-$(git -C "$REPO_ROOT" config user.name || echo "Bütçe Takip")}"
YAZAR_EPOSTA="${GIT_AUTHOR_EMAIL:-$(git -C "$REPO_ROOT" config user.email || echo "noreply@example.com")}"

git -c user.name="$YAZAR_AD" -c user.email="$YAZAR_EPOSTA" \
    commit -q -m "Bütçe Takip — açık kaynak ilk sürüm

Kişisel finans takip uygulaması: maaş, gelir, gider, kredi kartı, kredi,
yatırım ve bütçe tek nakit akışında. Kurulum için README'ye bak."

echo
echo "Hazır: $HEDEF"
echo "  $(git ls-files | wc -l | tr -d ' ') dosya, tek commit, dal: main"
echo "  commit yazarı: $YAZAR_AD <$YAZAR_EPOSTA>"
echo
echo "GitHub'a göndermek için:"
echo "  1) github.com/new -> PUBLIC bir depo aç (README/lisans EKLEME, boş kalsın)"
echo "  2) cd $HEDEF"
echo "     git remote add origin git@github.com:<kullanıcı>/<depo>.git"
echo "     git push -u origin main"
