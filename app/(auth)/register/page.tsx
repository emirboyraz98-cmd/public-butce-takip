import Link from "next/link";

import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div>
      <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.02em]">
        Kayıt ol
      </h2>
      <p className="text-muted-foreground mt-1.5 text-[13px]">
        Bütçe, yatırım ve maaş takibi için hesap oluştur.
      </p>

      <div className="mt-6">
        <RegisterForm />
      </div>

      <p className="text-muted-foreground mt-5 text-[13px]">
        Zaten hesabın var mı?{" "}
        <Link
          href="/login"
          className="text-accent-text font-semibold underline underline-offset-4"
        >
          Giriş yap
        </Link>
      </p>
    </div>
  );
}
