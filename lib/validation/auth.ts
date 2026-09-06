import { z } from "zod";

const usernameSchema = z
  .string()
  .min(3, "Kullanıcı adı en az 3 karakter olmalı")
  .max(32, "Kullanıcı adı en fazla 32 karakter olabilir")
  .regex(
    /^[a-z0-9_.]+$/i,
    "Kullanıcı adı sadece harf, rakam, nokta ve alt çizgi içerebilir"
  );

export const registerSchema = z.object({
  name: z.string().min(2, "Ad en az 2 karakter olmalı"),
  username: usernameSchema,
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
  /**
   * Bütün tutarların çevrileceği para birimi. Kayıtta soruluyor çünkü ilk
   * kaydını girdikten sonra değiştirmek geçmiş rakamların hepsini başka bir
   * ölçeğe taşıyor; baştan seçmek bunu bir kere yapıyor. Ayarlar'dan yine
   * değiştirilebilir.
   *
   * EUR yok: teslimat EUR'yu her baz para birimi seçicisinden kaldırdı.
   * EUR yalnızca tek bir harcamanın para birimi olarak kalıyor.
   */
  baseCurrency: z.enum(["TRY", "USD"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Şifre gerekli"),
});

export type LoginInput = z.infer<typeof loginSchema>;
