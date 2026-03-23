import { describe, it, expect, beforeEach } from "vitest";
import { i18n, t } from "../lib/translate.ts";

describe("i18n", () => {
  let translate: TranslateModule;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createStorageMock());
    vi.stubGlobal("navigator", { language: "en-US" } as Navigator);
    translate = await import("../lib/translate.ts");
    localStorage.clear();
    await i18n.setLocale("zh-CN");
  });

  it("should return the key if translation is missing", () => {
    expect(translate.t("non.existent.key")).toBe("non.existent.key");
  });

  it("should return the correct Chinese translation", () => {
    expect(t("common.health")).toBe("健康状况");
  });

  it("should replace parameters correctly", () => {
    expect(t("overview.stats.cronNext", { time: "10:00" })).toBe("下次唤醒 10:00");
  });

  it("should return key when translation is not found", async () => {
    expect(t("totally.nonexistent.key")).toBe("totally.nonexistent.key");
  });

  it("default locale is zh-CN", () => {
    expect(i18n.getLocale()).toBe("zh-CN");
  });

  it("skips node localStorage accessors that warn without a storage file", async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", { language: "en-US" } as Navigator);
    const warningSpy = vi.spyOn(process, "emitWarning");

    const fresh = await import("../lib/translate.ts");

    expect(fresh.i18n.getLocale()).toBe("en");
    expect(warningSpy).not.toHaveBeenCalledWith(
      "`--localstorage-file` was provided without a valid path",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps the version label available in shipped locales", () => {
    expect((pt_BR.common as { version?: string }).version).toBeTruthy();
    expect((zh_CN.common as { version?: string }).version).toBeTruthy();
    expect((zh_TW.common as { version?: string }).version).toBeTruthy();
  });
});
