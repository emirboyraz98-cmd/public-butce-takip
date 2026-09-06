import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tasarım referansı ve kurulu beceriler: bizim yazdığımız kod değil,
    // düzeltilecek de değil — sadece bakılacak. Lint çıktısını, gerçek
    // sorunları gömecek kadar dolduruyorlardı.
    "Website redesign project/**",
    ".agents/**",
  ]),
]);

export default eslintConfig;
