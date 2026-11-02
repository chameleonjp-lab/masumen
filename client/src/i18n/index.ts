import { sourceKeys } from "./source-keys";
import { gameMessageIndices } from "./game-message-patterns";
import { messages as english, extras as englishExtras } from "./locales/en";

type LocaleCatalog = {
  messages: readonly string[];
  extras?: Record<string, string>;
};
export const languages = [
  ["ja", "日本語"],
  ["en", "English"],
  ["es", "Español"],
  ["pt-BR", "Português (Brasil)"],
  ["zh-Hans", "简体中文"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["ko", "한국어"],
  ["ru", "Русский"],
  ["it", "Italiano"],
  ["zh-Hant", "繁體中文"],
  ["id", "Bahasa Indonesia"],
  ["tr", "Türkçe"],
  ["vi", "Tiếng Việt"],
  ["th", "ไทย"],
] as const;
export type Language = (typeof languages)[number][0];
export const LANGUAGE_KEY = "masumen.language.v1";
const modules = import.meta.glob<LocaleCatalog>("./locales/*.ts", {
  eager: true,
});
export const catalogs: Partial<Record<Language, LocaleCatalog>> = {
  ja: { messages: sourceKeys },
  en: { messages: english, extras: englishExtras },
};
for (const [path, catalog] of Object.entries(modules)) {
  const id = path.slice("./locales/".length, -3) as Language;
  if (languages.some(([language]) => language === id)) catalogs[id] = catalog;
}
const sourceIndices = new Map<string, number>(
  sourceKeys.map((key, index) => [key, index])
);
const listeners = new Set<() => void>();
const messageCache = new Map<string, string>();

export function languageFromTag(value: unknown): Language | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().replaceAll("_", "-").toLowerCase();
  const parts = tag.split("-");
  if (parts[0] === "zh") {
    if (parts.includes("hans")) return "zh-Hans";
    return parts.includes("hant") ||
      parts.some(part => ["tw", "hk", "mo"].includes(part))
      ? "zh-Hant"
      : "zh-Hans";
  }
  if (parts[0] === "pt") return "pt-BR";
  return (
    languages.find(([id]) => id.toLowerCase() === tag)?.[0] ??
    languages.find(([id]) => id === parts[0])?.[0] ??
    null
  );
}

export function chooseLanguage(
  saved: unknown,
  browserLanguages: readonly string[] = []
): Language {
  const selected = languageFromTag(saved);
  if (selected) return selected;
  for (const tag of browserLanguages) {
    const candidate = languageFromTag(tag);
    if (candidate) return candidate;
  }
  return "en";
}

function initialLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = globalThis.localStorage?.getItem(LANGUAGE_KEY) ?? null;
  } catch {
    /* Storage may be unavailable. */
  }
  return chooseLanguage(
    saved,
    typeof window === "undefined" ? [] : (globalThis.navigator?.languages ?? [])
  );
}
let currentLanguage: Language = initialLanguage();
export function getLanguage(): Language {
  return currentLanguage;
}
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setLanguage(
  value: string,
  options: { persist?: boolean; storage?: Pick<Storage, "setItem"> } = {}
): void {
  currentLanguage = languageFromTag(value) ?? "en";
  messageCache.clear();
  if (options.persist !== false) {
    try {
      (options.storage ?? globalThis.localStorage)?.setItem(
        LANGUAGE_KEY,
        currentLanguage
      );
    } catch {
      /* Session choice still works. */
    }
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = currentLanguage;
    document.title = t("マスメン");
  }
  listeners.forEach(listener => listener());
}

export function templateFor(source: string): string {
  if (currentLanguage === "ja") return source;
  const catalog = catalogs[currentLanguage] ?? catalogs.en!;
  const index = sourceIndices.get(source);
  if (index !== undefined)
    return catalog.messages[index] ?? english[index] ?? source;
  if (catalog.extras && Object.hasOwn(catalog.extras, source))
    return catalog.extras[source];
  if (Object.hasOwn(englishExtras, source)) return englishExtras[source];
  return source;
}
export function t(source: string, ...values: unknown[]): string {
  return templateFor(source).replace(
    /\{(\d+)\}/g,
    (placeholder, index: string) =>
      Number(index) < values.length
        ? String(values[Number(index)] ?? "")
        : placeholder
  );
}
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  const locale =
    currentLanguage === "zh-Hans"
      ? "zh-CN"
      : currentLanguage === "zh-Hant"
        ? "zh-TW"
        : currentLanguage;
  return new Intl.NumberFormat(locale, options).format(value);
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const messagePatterns = gameMessageIndices
  .map(index => {
    const source = sourceKeys[index];
    const slots: number[] = [];
    let pattern = "",
      cursor = 0;
    for (const match of Array.from(source.matchAll(/\{(\d+)\}/g))) {
      pattern += escapeRegex(source.slice(cursor, match.index)) + "(.*?)";
      slots.push(Number(match[1]));
      cursor = match.index + match[0].length;
    }
    pattern += escapeRegex(source.slice(cursor));
    return {
      source,
      slots,
      pattern: new RegExp("^" + pattern + "$"),
      specificity: source.replace(/\{\d+\}/g, "").length,
    };
  })
  .sort((left, right) => right.specificity - left.specificity);
const actionLabels: Readonly<Record<string, string>> = {
  move: "移動",
  "normal-shot": "通常射撃",
  "charge-shot": "チャージ射撃",
  card: "カード送信",
};

/** Translate known engine messages at the display boundary. No game state or identifiers are changed. */
export function translateGameText(
  value: string | null | undefined,
  depth = 0
): string {
  const source = value ?? "";
  if (currentLanguage === "ja" || !source || depth > 5) return source;
  if (messageCache.has(source)) return messageCache.get(source)!;
  let result = templateFor(source);
  if (result === source && Object.hasOwn(actionLabels, source))
    result = t(actionLabels[source]);
  if (result === source) {
    for (const entry of messagePatterns) {
      const match = entry.pattern.exec(source);
      if (!match) continue;
      const values: string[] = [];
      entry.slots.forEach((slot, index) => {
        values[slot] = translateGameText(match[index + 1], depth + 1);
      });
      result = t(entry.source, ...values);
      break;
    }
  }
  if (result === source) {
    for (const separator of [" — ", "・", " / "]) {
      if (!source.includes(separator)) continue;
      result = source
        .split(separator)
        .map(part => translateGameText(part, depth + 1))
        .join(separator === "・" ? t("・") : separator);
      if (result !== source) break;
    }
  }
  if (messageCache.size >= 1024) messageCache.clear();
  messageCache.set(source, result);
  return result;
}
