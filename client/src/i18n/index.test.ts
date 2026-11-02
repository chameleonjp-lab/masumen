import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CARD_CATALOG } from "@/game/deck";
import { ENEMY_DEFINITIONS } from "@/game/data/enemies";
import { cardPresentation } from "@/game/cardPresentation";
import { gameMessageIndices } from "./game-message-patterns";
import { extraKeys } from "./extra-keys";
import { sourceKeys } from "./source-keys";
import { msg } from "./react";
import {
  languages,
  catalogs,
  chooseLanguage,
  getLanguage,
  languageFromTag,
  setLanguage,
  t,
  translateGameText,
} from "./index";

afterEach(() => setLanguage("en", { persist: false }));
const placeholders = (text: string) =>
  Array.from(text.matchAll(/\{\d+\}/g), match => match[0]).sort();

describe("presentation language contract", () => {
  it("describes the actual existing final wave without changing the combat rule", () => {
    const engine = readFileSync(new URL("../game/GameWorld.ts", import.meta.url), "utf8");
    const finalWave = Number(/const FINAL_WAVE = (\d+);/.exec(engine)?.[1]);
    expect(finalWave).toBeGreaterThan(0);
    for (const index of [458, 459, 585, 605]) {
      for (const catalog of Object.values(catalogs)) {
        expect(catalog!.messages[index].replace(/\{\d+\}/g, "").match(/\d+/g)).toEqual([String(finalWave)]);
      }
    }
  });

  it("provides every source and extra message in all 15 languages", () => {
    expect(Object.keys(catalogs).sort()).toEqual(languages.map(([id]) => id).sort());
    for (const [id] of languages) {
      if (id === "ja") continue;
      expect(Object.keys(catalogs[id]!.extras ?? {}).sort(), id).toEqual([...extraKeys].sort());
    }
  });

  it("uses saved choice, explicit script, supported browser language, then English", () => {
    expect(chooseLanguage("de", ["ja"])).toBe("de");
    expect(chooseLanguage(null, ["xx", "pt-PT"])).toBe("pt-BR");
    expect(languageFromTag("zh-Hans-TW")).toBe("zh-Hans");
    expect(languageFromTag("zh-Hant-CN")).toBe("zh-Hant");
    expect(languageFromTag("toString")).toBeNull();
    expect(chooseLanguage(null, ["xx"])).toBe("en");
    setLanguage("fr", {
      storage: {
        setItem() {
          throw Error("denied");
        },
      },
    });
    expect(getLanguage()).toBe("fr");
  });
  it("keeps exact placeholders in every supplied catalog and extra message", () => {
    expect(sourceKeys).toHaveLength(700);
    for (const [locale, catalog] of Object.entries(catalogs)) {
      expect(catalog.messages, locale).toHaveLength(sourceKeys.length);
      const numbers = (text: string) => Array.from(text.normalize("NFKC").replace(/\{\d+\}/g, "").matchAll(/\d+(?:\.\d+)?/g), match => match[0]).sort();
      sourceKeys.forEach((key, index) => {
        expect(catalog.messages[index].trim(), `${locale}: ${index}`).not.toBe(
          ""
        );
        expect(
          placeholders(catalog.messages[index]),
          `${locale}: ${index}`
        ).toEqual(placeholders(key));
        expect(numbers(catalog.messages[index]), `${locale}: ${index}`).toEqual(numbers(key));
      });
      for (const [key, value] of Object.entries(catalog.extras ?? {}))
        expect(placeholders(value)).toEqual(placeholders(key));
    }
  });
  it("translates all internal dynamic message templates without changing engine data", () => {
    setLanguage("en", { persist: false });
    const original = JSON.stringify([CARD_CATALOG, ENEMY_DEFINITIONS]);
    for (const index of gameMessageIndices) {
      const source = sourceKeys[index];
      const count =
        Math.max(
          ...Array.from(source.matchAll(/\{(\d+)\}/g), match =>
            Number(match[1])
          )
        ) + 1;
      const values = Array.from({ length: count }, (_, value) =>
        String(value + 7)
      );
      const raw = source.replace(
        /\{(\d+)\}/g,
        (_, value: string) => values[Number(value)]
      );
      expect(translateGameText(raw), source).toBe(t(source, ...values));
    }
    expect(translateGameText("連射弾 を送信 — 同期効果で威力2倍")).toBe(
      "Deployed Rapid Shot — power ×2 from Sync"
    );
    expect(translateGameText("防壁３号 — 横一列砲撃")).toBe(
      "Bulwark No. 3 — Row Cannon"
    );
    for (const card of CARD_CATALOG) {
      const presentation = cardPresentation(card);
      for (const value of Object.values(presentation)) {
        if (typeof value === "string")
          expect(value).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      }
      expect(presentation.roleLabel).not.toBe(card.family);
    }
    expect(JSON.stringify([CARD_CATALOG, ENEMY_DEFINITIONS])).toBe(original);
  });
  it("treats player names as literal values and retains rich React content safely", () => {
    setLanguage("en", { persist: false });
    const playerName = "連射弾 <img src=x onerror=alert(1)>";
    expect(t("{0} の結果", playerName)).toBe(`Result for ${playerName}`);
    expect(t("toString")).toBe("toString");
    const markup = renderToStaticMarkup(
      createElement("p", null, msg("{0} の結果", playerName))
    );
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<img");
    expect(
      renderToStaticMarkup(
        createElement(
          "p",
          null,
          msg("最終スコア {0}", createElement("b", null, "1234"))
        )
      )
    ).toBe("<p>Final score <b>1234</b></p>");
  });
});
