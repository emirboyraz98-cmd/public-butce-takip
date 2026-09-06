"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";

import { forgetRange } from "@/lib/dashboard/rangePreference";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  // Oturum açıkken üyeliği kapatılan kullanıcı buraya yönlendirilir; sebebi
  // yazmazsak kendiliğinden atılmış gibi görünüyor.
  const inactive = searchParams.get("reason") === "inactive";
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        username: values.username,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        // Şifre doğru ama üyelik açık değilse ayrı mesaj; "şifre hatalı"
        // demek kullanıcıyı boşuna şifresini denemeye iterdi.
        const code = (result as { code?: string }).code;
        setServerError(
          code === "pending"
            ? "Hesabın henüz onaylanmadı. Yönetici onayladığında giriş yapabilirsin."
            : code === "disabled"
              ? "Hesabın devre dışı bırakılmış. Yöneticiyle iletişime geç."
              : "Kullanıcı adı veya şifre hatalı"
        );
        return;
      }

      // Her yeni oturum Genel Bakış'ta varsayılan son 6 ayla başlasın.
      forgetRange();

      router.push(callbackUrl);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kullanıcı adı</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  autoComplete="username"
                  placeholder="kullanıcı adınız"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Şifre</FormLabel>
              <FormControl>
                <PasswordInput placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {!serverError && inactive && (
          <p className="text-muted-foreground text-sm">
            Üyeliğin şu anda aktif değil, bu yüzden oturumun kapatıldı.
          </p>
        )}
        {serverError && (
          <p className="text-destructive text-sm">{serverError}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
    </Form>
  );
}
