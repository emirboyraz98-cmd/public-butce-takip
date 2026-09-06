import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});

/**
 * Şifre doğru ama üyelik henüz açık değil. Yanlış şifreden ayrı bir hata:
 * kullanıcı "onay bekliyorum" ile "şifremi yanlış girdim" arasındaki farkı
 * görebilsin. Şifre doğrulandıktan SONRA fırlatıldığı için hesabın varlığını
 * yabancıya sızdırmaz.
 */
class AccountNotActive extends CredentialsSignin {
  constructor(public readonly reason: "pending" | "disabled") {
    super(reason);
    this.code = reason;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Kullanıcı adı", type: "text" },
        password: { label: "Şifre", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Onay beklemeyen hiçbir hesap oturum açamaz. Kontrol burada:
        // oturum verilseydi sunucu aksiyonları (her biri yalnızca oturum
        // varlığına bakıyor) doğrudan çağrılabilirdi.
        if (user.status === "PENDING") throw new AccountNotActive("pending");
        if (user.status === "DISABLED") throw new AccountNotActive("disabled");

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = (user as { username?: string }).username;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.role = token.role as "USER" | "ADMIN";
      }
      return session;
    },
  },
});
