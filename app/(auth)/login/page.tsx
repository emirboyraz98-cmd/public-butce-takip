import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div>
      <h2 className="t-display">
        Giriş yap
      </h2>
      <p className="t-body text-muted-foreground mt-1.5">
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
