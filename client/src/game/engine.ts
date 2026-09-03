import { Engine } from "@babylonjs/core/Engines/engine";

/**
 * 起動失敗の回帰修正（2026-09-03）
 * 再現: WebGLが利用できない端末でGameCanvasを開く。
 * 期待仕様: 起動処理を画面ごと落とさず、GameCanvasが復旧案内を表示する。
 * 現状位置: GameCanvasの同期的なEngine生成と、その後の非同期シーン生成。
 * 修正方針: Engine生成をtry/catchで包み、失敗をnullとしてUIへ返す。
 * 追加テスト: engine.test.tsで同期例外と正常生成の両方を固定する。
 */
export function createGameEngine(
  canvas: HTMLCanvasElement,
  EngineConstructor: typeof Engine = Engine
): Engine | null {
  try {
    return new EngineConstructor(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
  } catch {
    // WebGL can be unavailable before the asynchronous scene creation starts.
    return null;
  }
}
