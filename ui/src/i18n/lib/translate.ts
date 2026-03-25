import { getSafeLocalStorage } from "../../local-storage.ts";
import { zh_CN } from "../locales/zh-CN.ts";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  resolveNavigatorLocale,
} from "./registry.ts";
import type { Locale, TranslationMap } from "./types.ts";

type Subscriber = (locale: Locale) => void;

export { SUPPORTED_LOCALES, isSupportedLocale };

class I18nManager {
  private locale: Locale = DEFAULT_LOCALE;
  private translations: Record<Locale, TranslationMap> = { "zh-CN": zh_CN };
  private subscribers: Set<Subscriber> = new Set();

  constructor() {
    this.loadLocale();
  }

  private readStoredLocale(): string | null {
    const storage = getSafeLocalStorage();
    if (!storage) {
      return null;
    }
    try {
      return storage.getItem("openclaw.i18n.locale");
    } catch {
      return null;
    }
  }

  private persistLocale(locale: Locale) {
    const storage = getSafeLocalStorage();
    if (!storage) {
      return;
    }
    try {
      storage.setItem("openclaw.i18n.locale", locale);
    } catch {
      // Ignore storage write failures in private/blocked contexts.
    }
  }

  private resolveInitialLocale(): Locale {
    const saved = this.readStoredLocale();
    if (isSupportedLocale(saved)) {
      return saved;
    }
    const language =
      typeof globalThis.navigator?.language === "string" ? globalThis.navigator.language : null;
    return resolveNavigatorLocale(language ?? "");
  }

  private loadLocale() {
    const initialLocale = this.resolveInitialLocale();
    if (initialLocale === DEFAULT_LOCALE) {
      this.locale = DEFAULT_LOCALE;
      return;
    }
    // Use the normal locale setter so startup locale loading follows the same
    // translation-loading + notify path as manual locale changes.
    void this.setLocale(initialLocale);
  }

  public getLocale(): Locale {
    return this.locale;
  }

  public async setLocale(locale: Locale) {
    // 只有中文，无需切换语言，但需要通知订阅者
    this.locale = locale;
    this.subscribers.forEach((sub) => sub(locale));
  }

  public subscribe(sub: Subscriber) {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  public t(key: string, params?: Record<string, string>): string {
    const keys = key.split(".");
    let value: unknown = this.translations[this.locale];

    for (const k of keys) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = undefined;
        break;
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`);
    }

    return value;
  }
}

export const i18n = new I18nManager();
export const t = (key: string, params?: Record<string, string>) => i18n.t(key, params);
