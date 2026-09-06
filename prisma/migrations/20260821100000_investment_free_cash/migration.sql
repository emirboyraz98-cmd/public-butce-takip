-- Satış hasılatının nakit akışına girip girmediği.
--
-- Varsayılan TRUE: eski davranışta her satış doğrudan gelir sayılıyordu ve
-- mevcut kayıtların anlamı değişmemeli. Kullanıcı bundan sonra satış
-- girerken işareti kaldırırsa para "serbest nakit" olarak yatırım tarafında
-- kalır — cebe girmediği hâlde gelir yazılması, borsadan para çekmeden
-- pozisyon değiştiren herkeste nakit akışını şişiriyordu.
ALTER TABLE "InvestmentTransaction"
  ADD COLUMN "proceedsWithdrawn" BOOLEAN NOT NULL DEFAULT true;
