"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";

import { forgetRange } from "@/lib/dashboard/rangePreference";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { registerUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function RegisterForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", username: "", password: "", baseCurrency: "TRY" },
  });

  function onSubmit(values: RegisterInput) {
    setServerError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", values.name);
      formData.set("username", values.username);
      formData.set("password", values.password);
      formData.set("baseCurrency", values.baseCurrency);

      const result = await registerUser({}, formData);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      // Onay bekleyen hesap giriş yapamaz; denemek "şifre hatalı" gibi
      // görünen bir hataya düşerdi.
      if (result.pending) {
        setSubmitted(true);
        return;
      }

      const signInResult = await signIn("credentials", {
        username: values.username,
        password: values.password,
        redirect: false,
      });

      if (signInResult?.error) {
        router.push("/login");
        return;
      }

      // Aynı tarayıcıda önceki oturumdan kalan aralık yeni kullanıcıya
      // devrolmasın; Genel Bakış varsayılan son 6 ayla açılsın.
      forgetRange();

      router.push("/dashboard");
      router.refresh();
    });
  }

  if (submitted) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium">Kaydın alındı, onay bekliyor.</p>
        <p className="text-muted-foreground">
          Hesabın yönetici onayladıktan sonra açılacak. Onaylandığında aynı
          kullanıcı adı ve şifreyle giriş yapabilirsin.
        </p>
        <Button variant="outline" onClick={() => router.push("/login")}>
          Giriş ekranına dön
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ad Soyad</FormLabel>
              <FormControl>
                <Input placeholder="Ad Soyad" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        <FormField
          control={form.control}
          name="baseCurrency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Baz para birimi</FormLabel>
              <FormControl>
                {/* Açılır liste değil segment: iki seçenek var ve hangisinin
                    seçili olduğu listeyi açmadan görünmeli. */}
                <div className="border-border flex border">
                  {(["TRY", "USD"] as const).map((option, i) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={field.value === option}
                      onClick={() => field.onChange(option)}
                      className={cn(
                        "min-h-11 flex-1 px-3 text-[13px] font-semibold sm:min-h-9",
                        i > 0 && "border-border border-l",
                        field.value === option
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </FormControl>
              <p className="text-muted-foreground text-[12px] leading-snug">
                Bütün tutarlar bu para birimine çevrilerek toplanır. Sonradan
                Ayarlar&apos;dan değiştirebilirsin.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p className="text-destructive text-sm">{serverError}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Kaydediliyor…" : "Kayıt ol"}
        </Button>
      </form>
    </Form>
  );
}
