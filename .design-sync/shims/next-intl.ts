// Design-environment adapter for next-intl. The real useTranslations throws
// outside a NextIntlClientProvider, and asking the design agent to wire one up
// (locale + message catalogue) for every design is friction with no payoff —
// designs render in English. This reads the app's REAL English catalogue, so
// copy stays identical to production and can't drift from a hand-kept list.
import en from "../../messages/en.json";

type Values = Record<string, string | number>;
type Catalogue = Record<string, unknown>;

function lookup(ns: string | undefined, key: string): string | undefined {
  const path = [...(ns ? ns.split(".") : []), ...key.split(".")];
  let node: unknown = en as Catalogue;
  for (const part of path) {
    if (node && typeof node === "object" && part in (node as Catalogue)) node = (node as Catalogue)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export function useTranslations(namespace?: string) {
  const t = (key: string, values?: Values) => {
    const raw = lookup(namespace, key) ?? key;
    return values ? raw.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m)) : raw;
  };
  t.rich = t;
  t.has = (key: string) => lookup(namespace, key) !== undefined;
  return t;
}

export function useLocale() {
  return "en";
}
