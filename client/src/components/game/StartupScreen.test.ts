import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StartupGate } from "./StartupScreen";
import type { StartupState } from "@/game/startup";

describe("起動画面の排他表示", () => {
  for (const hasName of [false, true]) {
    for (const state of [
      { status: "loading", stage: "scene" },
      { status: "failed", stage: "engine", code: "WebGLUnavailable" },
      { status: "ready" },
    ] satisfies StartupState[]) {
      it(`${state.status} / 名前登録 ${hasName}`, () => {
        const html = renderToStaticMarkup(createElement(StartupGate, {
          state, hasName,
          nameGate: createElement("form", { id: "name-form" }),
          children: createElement("section", { id: "battle-ui" }),
        }));
        expect(html.includes('id="name-form"')).toBe(state.status === "ready" && !hasName);
        expect(html.includes('id="battle-ui"')).toBe(state.status === "ready" && hasName);
        expect(html.includes('role="alert"')).toBe(state.status === "failed");
        expect(html.includes('role="status"')).toBe(state.status === "loading");
      });
    }
  }
});
