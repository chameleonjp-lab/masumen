import {
  Fragment,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getLanguage, subscribeLanguage, templateFor, t } from "./index";

export function useLanguage() {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguage,
    getLanguage
  );
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("マスメン");
  }, [language]);
  return language;
}

/** Numbered placeholders can move in translation while retaining safe React nodes. */
export function msg(source: string, ...values: ReactNode[]): ReactNode {
  const parts = templateFor(source).split(/\{(\d+)\}/g);
  return parts.map((part, index) =>
    index % 2 === 0 ? (
      part
    ) : (
      <Fragment key={index}>
        {Number(part) < values.length ? values[Number(part)] : `{${part}}`}
      </Fragment>
    )
  );
}
