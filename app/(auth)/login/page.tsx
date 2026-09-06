import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div>
      <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.02em]">
        Giriş yap
      </h2>
      <p className="text-muted-foreground mt-1.5 text-[13px]">
        Bütçe takip hesabına giriş yap.
      </p>

      <div className="mt-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>

      <p className="text-muted-foreground mt-5 text-[13px]">
        Hesabın yok mu?{" "}
        <Link
          href="/register"
          className="text-accent-text font-semibold underline underline-offset-4"
        >
          Kayıt ol
        </Link>
      </p>
    </div>
  );
}
