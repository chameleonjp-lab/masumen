export type StartupStage = "engine" | "scene" | "render";
export type StartupState =
  | { status: "loading"; stage: StartupStage }
  | { status: "ready" }
  | { status: "failed"; stage: StartupStage; code: string };

interface RuntimeEngine {
  runRenderLoop: (render: () => void) => void;
  dispose: () => void;
}
interface RuntimeHandle {
  scene: { render: () => void };
  dispose: () => void;
}

/** Owns startup, cancellation and failure cleanup, including late scene resolution. */
export function startGameRuntime<E extends RuntimeEngine, H extends RuntimeHandle>(options: {
  createEngine: () => E | null;
  createScene: (engine: E) => Promise<H>;
  attachResize: (engine: E) => () => void;
  onReady: (handle: H) => void;
  onState: (state: StartupState) => void;
}): () => void {
  let disposed = false;
  let ready = false;
  let engine: E | null = null;
  let handle: H | null = null;
  let detachResize: (() => void) | undefined;
  let stage: StartupStage = "engine";
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    detachResize?.();
    handle?.dispose();
    engine?.dispose();
  };
  const fail = (error: unknown) => {
    if (disposed) return;
    dispose();
    // Expose the failure stage and error type, never URLs or arbitrary exception text.
    const name = error instanceof Error ? error.name : "UnknownError";
    options.onState({ status: "failed", stage, code: /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "Error" });
  };
  options.onState({ status: "loading", stage });
  try {
    engine = options.createEngine();
    if (!engine) {
      const error = new Error("Engine unavailable");
      error.name = "WebGLUnavailable";
      throw error;
    }
    detachResize = options.attachResize(engine);
    stage = "scene";
    options.onState({ status: "loading", stage });
    const activeEngine = engine;
    void Promise.resolve().then(() => disposed ? null : options.createScene(activeEngine)).then(created => {
      if (!created) return;
      if (disposed) { created.dispose(); return; }
      handle = created;
      stage = "render";
      options.onState({ status: "loading", stage });
      activeEngine.runRenderLoop(() => {
        if (disposed) return;
        try {
          created.scene.render();
          if (!ready) {
            ready = true;
            options.onReady(created);
            options.onState({ status: "ready" });
          }
        } catch (error) { fail(error); }
      });
    }).catch(fail);
  } catch (error) { fail(error); }
  return dispose;
}
