import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUniqueMock(...a) } },
}));

const { isAdmin, requireAdminUserId } = await import("./requireAdmin");

const session = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

beforeEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
});

describe("requireAdminUserId", () => {
  it("aktif yöneticiye izin verir", async () => {
    session("u1");
    findUniqueMock.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    await expect(requireAdminUserId()).resolves.toBe("u1");
  });

  it("sıradan kullanıcıyı reddeder", async () => {
    session("u1");
    findUniqueMock.mockResolvedValue({ role: "USER", status: "ACTIVE" });
    await expect(requireAdminUserId()).rejects.toThrow(/yönetici yetkisi/);
  });

  it("devre dışı bırakılmış yöneticiyi reddeder", async () => {
    // Rol JWT'de taşınıyor; yetki ona dayansaydı bu kişi token süresi
    // dolana kadar yönetici kalırdı.
    session("u1");
    findUniqueMock.mockResolvedValue({ role: "ADMIN", status: "DISABLED" });
    await expect(requireAdminUserId()).rejects.toThrow(/yönetici yetkisi/);
  });

  it("onay bekleyen yöneticiyi reddeder", async () => {
    session("u1");
    findUniqueMock.mockResolvedValue({ role: "ADMIN", status: "PENDING" });
    await expect(requireAdminUserId()).rejects.toThrow(/yönetici yetkisi/);
  });

  it("veritabanında olmayan kullanıcıyı reddeder", async () => {
    session("u1");
    findUniqueMock.mockResolvedValue(null);
    await expect(requireAdminUserId()).rejects.toThrow(/yönetici yetkisi/);
  });

  it("oturum yoksa reddeder ve veritabanına hiç gitmez", async () => {
    session(null);
    await expect(requireAdminUserId()).rejects.toThrow(/Oturum bulunamadı/);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("yetkiyi oturumdaki role göre değil veritabanına bakarak verir", async () => {
    // Oturum "ADMIN" diyor ama veritabanı "USER" — kaynak veritabanı.
    authMock.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    findUniqueMock.mockResolvedValue({ role: "USER", status: "ACTIVE" });
    await expect(requireAdminUserId()).rejects.toThrow(/yönetici yetkisi/);
  });
});

describe("isAdmin", () => {
  it("yönetici için true", async () => {
    session("u1");
    findUniqueMock.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    await expect(isAdmin()).resolves.toBe(true);
  });

  it("diğer herkes için false (fırlatmaz)", async () => {
    session("u1");
    findUniqueMock.mockResolvedValue({ role: "USER", status: "ACTIVE" });
    await expect(isAdmin()).resolves.toBe(false);
  });

  it("oturum yokken false", async () => {
    session(null);
    await expect(isAdmin()).resolves.toBe(false);
  });
});
