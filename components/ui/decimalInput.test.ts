import { describe, expect, it } from "vitest";

import { parseDecimalInput } from "./decimal-input";

describe("parseDecimalInput", () => {
  it("virgüllü ondalığı okur (Türkçe klavye)", () => {
    expect(parseDecimalInput("17,5")).toBe(17.5);
    expect(parseDecimalInput("0,3")).toBe(0.3);
  });

  it("noktalı ondalığı da okur", () => {
    expect(parseDecimalInput("17.5")).toBe(17.5);
  });

  it("tam sayıyı okur", () => {
    expect(parseDecimalInput("17")).toBe(17);
  });

  it("yarım kalmış girişte (ondalık ayracı yeni yazılmış) null döner", () => {
    // Kritik durum: kullanıcı "17," yazdığı anda sayı geçersizdir ama
    // metin korunmalıdır — bileşen bu null'da metni silmez.
    expect(parseDecimalInput("17,")).toBe(17);
    expect(parseDecimalInput(",")).toBeNull();
    expect(parseDecimalInput(".")).toBeNull();
  });

  it("boş girişte null döner", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("   ")).toBeNull();
  });

  it("çok küçük kesirleri korur", () => {
    expect(parseDecimalInput("0,00042")).toBe(0.00042);
  });
});
