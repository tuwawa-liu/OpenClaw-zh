import type { CliLocale, TaglineSet, TranslationMap } from "./types.js";
import { en, enTaglines } from "./locales/en.js";

const SUPPORTED: readonly CliLocale[] = ["en", "zh-CN"];

let currentLocale: CliLocale = "en";
const translations: Partial<Record<CliLocale, TranslationMap>> = { en };
let taglines: TaglineSet = enTaglines;
let localeReady: Promise<void> | undefined;

function resolveEnvLocale(): CliLocale {
  const raw =
    process.env.OPENCLAW_LANG ??
    process.env.LC_ALL ??
    process.env.LANG ??
    process.env.LANGUAGE ??
    "";
  const normalized = raw.replace(/_/g, "-").split(".")[0];
  if (normalized.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

async function loadLocale(locale: CliLocale) {
  if (locale === "en" || translations[locale]) return;
  try {
    if (locale === "zh-CN") {
      const mod = await import("./locales/zh-CN.js");
      translations["zh-CN"] = mod.zh_CN;
      taglines = mod.zhCNTaglines;
    }
  } catch {
    // Fallback to English silently.
  }
}

function initLocale() {
  const locale = resolveEnvLocale();
  currentLocale = locale;
  if (locale !== "en") {
    localeReady = loadLocale(locale);
  }
}

export function getLocale(): CliLocale {
  return currentLocale;
}

export function setLocale(locale: CliLocale) {
  if (SUPPORTED.includes(locale)) {
    currentLocale = locale;
    if (locale !== "en") {
      localeReady = loadLocale(locale);
    }
  }
}

export async function ensureLocaleLoaded(): Promise<void> {
  if (localeReady) await localeReady;
}

export function getTaglines(): TaglineSet {
  return taglines;
}

function lookup(map: TranslationMap | undefined, keys: string[]): string | undefined {
  let value: unknown = map;
  for (const k of keys) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return typeof value === "string" ? value : undefined;
}

export function t(key: string, params?: Record<string, string>): string {
  const keys = key.split(".");
  let value = lookup(translations[currentLocale], keys);
  if (value === undefined && currentLocale !== "en") {
    value = lookup(translations.en, keys);
  }
  if (value === undefined) return key;
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? `{${k}}`);
  }
  return value;
}

// Initialize on import.
initLocale();

export type { CliLocale, TranslationMap };
