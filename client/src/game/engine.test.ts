import { describe, expect, it } from "vitest";
import { createGameEngine } from "./engine";

describe("WebGL起動エラーの復旧", () => {
  it("描画エンジンが同期的に失敗した場合はnullを返す", () => {
    class UnsupportedEngine {
      constructor() {
        throw new Error("WebGL not supported");
      }
    }

    expect(
      createGameEngine(
        {} as HTMLCanvasElement,
        UnsupportedEngine as unknown as typeof import("@babylonjs/core/Engines/engine").Engine
      )
    ).toBeNull();
  });

  it("描画エンジンが作成できた場合はインスタンスを返す", () => {
    class SupportedEngine {
      constructor(
        readonly canvas: HTMLCanvasElement,
        readonly antialias: boolean,
        readonly options: Record<string, unknown>
      ) {}
    }

    const engine = createGameEngine(
      {} as HTMLCanvasElement,
      SupportedEngine as unknown as typeof import("@babylonjs/core/Engines/engine").Engine
    );

    expect(engine).not.toBeNull();
  });
});
