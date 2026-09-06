-- Üyelik onayı ve admin rolü.
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

ALTER TABLE "User"
  ADD COLUMN "role"         "UserRole"   NOT NULL DEFAULT 'USER',
  ADD COLUMN "status"       "UserStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvedAt"   TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT;

-- Mevcut kullanıcılar kilitlenmemeli: varsayılan PENDING olduğu için hepsi
-- açıkça ACTIVE yapılır.
UPDATE "User" SET "status" = 'ACTIVE', "approvedAt" = CURRENT_TIMESTAMP;

-- Admin, kurulumu yapanın ilk açtığı hesap — yani mevcut en eski kayıt.
-- Boş bir veritabanında bu ifade hiçbir satıra dokunmaz; sıfırdan kurulumda
-- ilk kullanıcının yönetici olmasını kayıt akışı (registerUser) üstleniyor.
UPDATE "User" SET "role" = 'ADMIN'
WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1);

CREATE INDEX "User_status_idx" ON "User"("status");
