-- Artık kullanılmayan kategoriler silinmek yerine gizlenebilsin: geçmiş
-- kayıtların etiketi korunur, seçim listelerinde görünmezler.
ALTER TABLE "ExpenseCategory"
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
