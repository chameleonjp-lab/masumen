/** Signal Relay Tactical component: the React frame supplies a clipped industrial HUD while Babylon owns the live arena. */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { ASSET_URLS } from "@/game/assets";
import { validateSelection } from "@/game/deck";
import { cardPreviewTiles, nearestEnemyPosition } from "@/game/data/cardCombatData";
import { createGameScene } from "@/game/scene";
import type { BattleSnapshot, GameHandle, GridPosition } from "@/game/types";
import FolderEditor from "@/components/game/FolderEditor";
import ResultScreen from "@/components/game/ResultScreen";
import Tutorial from "@/components/game/Tutorial";
import { createMovementRepeat, type MovementRepeat } from "@/game/movementRepeat";
import { beginTouchAction, createTouchInputState, endTouchAction, type TouchAction } from "@/game/touchInputGuard";
import {
  homeShareText,
  LAB_URL,
  readPlayerName,
  resultShareText,
  savePlayerName,
  shareOrCopy,
  shareStatusText,
  submitAndLoadRanking,
  type RankingRow,
} from "@/game/platform";

const initialSnapshot: BattleSnapshot = {
  mode: "custom",
  playerHp: 220,
  playerMaxHp: 220,
  playerGrid: { col: 1, row: 1 },
  gauge: 0,
  sync: false,
  emotion: "normal",
  emotionRemaining: 0,
  corruption: 0,
  charging: 0,
  barrier: 0,
  invincible: false,
  invincibleRemaining: 0,
  customHand: [],
  selected: [],
  focusedCard: null,
  selectionError: null,
  queue: [],
  enemies: [],
  panels: [],
  objects: [],
  projectiles: [],
  message: "端末を起動しています",
  elapsed: 0,
  counters: 0,
  rank: "—",
  wave: 1,
  score: 0,
  highScore: 0,
  bestWave: 0,
  paused: false,
  customRemaining: 10,
};

function meterStyle(value: number) {
  return { transform: `scaleX(${Math.max(0, Math.min(1, value / 100))})` };
}

const emotionLabels: Record<BattleSnapshot["emotion"], string> = {
  normal: "平常",
  synchronized: "完全同期",
  shaken: "動揺",
  enraged: "激昂",
  corrupted: "侵食",
};

function timecode(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

function cardClassLabel(card: BattleSnapshot["queue"][number]): string {
  if (card.isOverload) return "過負荷";
  if (card.folderClass === "trump") return "切札";
  if (card.folderClass === "upper" || card.tier === "mega") return "上位";
  return card.family;
}

const enemyPatternLabels: Record<string, string> = {
  "lane-sweep": "横一列砲撃",
  "column-scan": "縦列走査",
  "pursuit-dash": "踏み込み斬り",
  "mortar-spread": "砲撃準備",
  "pulse-grid": "電撃準備",
  "wave-runner": "水波準備",
  "boomer-arc": "周回弾準備",
  "hopper-bomb": "爆弾準備",
  "gaia-hammer": "槌撃準備",
  "weather-core": "天候攻撃準備",
  "support-relay": "支援行動準備",
  "mirror-node": "反射行動準備",
  "bastion-prime": "要塞行動準備",
  "prism-hunter": "転送斬準備",
  "climate-engine": "気象攻撃準備",
  "core-arbiter": "裁定攻撃準備",
};

function enemyReadoutLabel(
  enemy: BattleSnapshot["enemies"][number]
): string {
  if (enemy.counterWindow) return "完全同期カウンター受付";
  if (enemy.actionPhase === "counter-window") return "カウンター受付中";
  if (enemy.warningStage === "urgent")
    return "危険予兆 // " + (enemy.actionName ?? "攻撃準備");
  if (enemy.warningStage === "telegraph")
    return "攻撃予兆 // " + (enemy.actionName ?? "攻撃準備");
  if (enemy.actionPhase === "startup") return enemy.actionName ?? "攻撃準備";
  if (enemy.actionPhase === "active") return enemy.actionName ?? "攻撃中";
  if (enemy.actionPhase === "recovery") return "攻撃後の隙";
  if (enemy.actionPhase === "stunned") return "麻痺";
  if (enemy.state === "deleted") return "停止";
  return enemy.actionName ?? enemyPatternLabels[enemy.pattern] ?? "行動待機";
}

function previewTargets(
  card: BattleSnapshot["customHand"][number] | undefined,
  playerGrid: BattleSnapshot["playerGrid"],
  enemies: BattleSnapshot["enemies"],
  panels: BattleSnapshot["panels"]
) {
  return new Set(
    cardPreviewTiles(
      card,
      playerGrid,
      enemies
        .filter(enemy => enemy.state !== "deleted")
        .map(enemy => enemy.grid),
      panels
    ).map(tile => String(tile.col) + ":" + String(tile.row))
  );
}

function previewCenter(
  card: BattleSnapshot["customHand"][number] | undefined,
  playerGrid: BattleSnapshot["playerGrid"],
  enemies: BattleSnapshot["enemies"]
): GridPosition | null {
  if (!card) return null;
  const action = card.actionId ?? card.id;
  const activeEnemies = enemies.filter(enemy => enemy.state !== "deleted");
  if (action === "gridcut") {
    return nearestEnemyPosition(
      playerGrid,
      activeEnemies.map(enemy => enemy.grid)
    ) ?? {
      col: Math.min(5, Math.max(3, playerGrid.col + 2)),
      row: playerGrid.row,
    };
  }
  if (action === "cross") {
    return activeEnemies
      .filter(enemy => enemy.grid.row === playerGrid.row && enemy.grid.col > playerGrid.col)
      .sort((a, b) => a.grid.col - b.grid.col)[0]?.grid ?? {
        col: Math.min(5, playerGrid.col + 3),
        row: playerGrid.row,
      };
  }
  return null;
}

function previewDelay(
  card: BattleSnapshot["customHand"][number] | undefined,
  col: number,
  row: number,
  playerGrid: BattleSnapshot["playerGrid"],
  enemies: BattleSnapshot["enemies"]
) {
  if (!card) return 0;
  const action = card.actionId ?? card.id;
  if (action === "rapid" || action === "triplet") return Math.max(0, col - playerGrid.col) * 90;
  if (action === "fan") return Math.max(0, col - playerGrid.col) * 120 + Math.abs(row - playerGrid.row) * 40;
  if (action === "column" || action === "thunderline" || action === "sweep") return row * 110;
  if (action === "cross" || action === "gridcut") {
    const center = previewCenter(card, playerGrid, enemies);
    return center ? (Math.abs(col - center.col) + Math.abs(row - center.row)) * 100 : 0;
  }
  if (action === "slash" || action === "moonblade" || action === "dashslash") return 120;
  return Math.max(0, col - playerGrid.col) * 135;
}

function previewVector(card: BattleSnapshot["customHand"][number] | undefined) {
  if (!card) return "→";
  const action = card.actionId ?? card.id;
  if (action === "slash" || action === "sweep" || action === "moonblade" || action === "dashslash") return "⚔";
  if (action === "fan") return "⌁";
  if (action === "column" || action === "thunderline" || action === "sweep") return "↕";
  if (action === "cross" || action === "gridcut") return "✣";
  if (action === "web" || action === "frost") return "✽";
  if (card.target === "self") return "◎";
  if (card.target === "enemy-field") return "⇢";
  return "→";
}

const targetLabels: Record<string, string> = {
  front: "正面",
  near: "近距離",
  row: "横一列",
  column: "縦一列",
  cross: "十字",
  self: "自分",
  "enemy-field": "敵陣全体",
};

function targetLabel(card: BattleSnapshot["customHand"][number] | undefined): string {
  if (card?.rangeLabel) return card.rangeLabel;
  return targetLabels[card?.target ?? "front"] ?? "対象範囲";
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

function preventNativeAction(event: SyntheticEvent): void {
  if (!isEditableTarget(event.target)) event.preventDefault();
}

interface NameGateProps {
  draft: string;
  error: string;
  shareStatus: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onShare: () => void;
}

function NameGate({
  draft,
  error,
  shareStatus,
  onDraftChange,
  onSubmit,
  onShare,
}: NameGateProps) {
  return (
    <section className="name-gate" role="dialog" aria-modal="true" aria-labelledby="name-gate-title">
      <div className="name-gate__panel technical-panel">
        <p className="eyebrow">ACCESS / PLAYER REGISTRATION</p>
        <h1 id="name-gate-title">信号を入力して開始</h1>
        <p className="name-gate__copy">
          プレイヤー名を登録すると、戦闘結果をオンラインランキングに送信できます。
        </p>
        <label className="name-gate__label" htmlFor="masumen-player-name">
          プレイヤー名（必須）
        </label>
        <input
          id="masumen-player-name"
          className="name-gate__input"
          value={draft}
          maxLength={20}
          autoComplete="nickname"
          placeholder="名前を入力"
          onChange={event => onDraftChange(event.target.value)}
        />
        <p className="name-gate__status" role="status">
          {error || "名前を入力してからカード選択を開始してください"}
        </p>
        <button type="button" className="engage-button name-gate__submit" onClick={onSubmit}>
          カード選択を開始 <span>↗</span>
        </button>
        <div className="name-gate__links">
          <button type="button" onClick={onShare}>ゲームをシェア</button>
          <a href={LAB_URL} target="_blank" rel="noreferrer">実験場へ</a>
        </div>
        {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
      </div>
    </section>
  );
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const controllerRef = useRef<GameHandle["controller"] | null>(null);
  const [snapshot, setSnapshot] = useState<BattleSnapshot>(initialSnapshot);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(70);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [folderEditorOpen, setFolderEditorOpen] = useState(false);
  const [bootError, setBootError] = useState(false);
  const [playerName, setPlayerName] = useState(() => readPlayerName());
  const [nameDraft, setNameDraft] = useState(() => readPlayerName());
  const [nameError, setNameError] = useState("");
  const [nameShareStatus, setNameShareStatus] = useState("");
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [rankingStatus, setRankingStatus] = useState("ランキング登録：待機中");
  const resultSubmissionKeyRef = useRef<string | null>(null);
  const touchInputRef = useRef(createTouchInputState());
  const moveRepeatRef = useRef<MovementRepeat | null>(null);

  const stopMoveRepeat = () => {
    moveRepeatRef.current?.stop();
    moveRepeatRef.current = null;
  };

  const startMoveRepeat = (callback: () => void) => {
    if (!moveRepeatRef.current)
      moveRepeatRef.current = createMovementRepeat();
    moveRepeatRef.current.start(callback);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    let disposed = false;
    let handle: GameHandle | null = null;
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    createGameScene(engine, canvas, {
      onSnapshot: nextSnapshot => {
        if (!disposed) {
          if (nextSnapshot.mode !== "battle" || nextSnapshot.paused)
            stopMoveRepeat();
          setSnapshot(nextSnapshot);
        }
      },
    }).then(createdHandle => {
      if (disposed) {
        createdHandle.dispose();
        return;
      }
      handle = createdHandle;
      controllerRef.current = createdHandle.controller;
      createdHandle.controller.setSoundEnabled?.(soundEnabled);
      createdHandle.controller.setSoundVolume?.(soundVolume / 100);
      createdHandle.controller.setVibrationEnabled?.(vibrationEnabled);
      engine.runRenderLoop(() => createdHandle.scene.render());
    }).catch(() => {
      if (!disposed) setBootError(true);
    });
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(onResize);
    resizeObserver?.observe(canvas);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
      handle?.dispose();
      engine.dispose();
      controllerRef.current = null;
      startedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const gestureOptions: AddEventListenerOptions = { passive: false };
    const preventGesture = (event: Event) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    root.addEventListener("gesturestart", preventGesture, gestureOptions);
    root.addEventListener("gesturechange", preventGesture, gestureOptions);
    root.addEventListener("gestureend", preventGesture, gestureOptions);
    root.addEventListener("touchstart", preventMultiTouch, gestureOptions);
    root.addEventListener("touchmove", preventMultiTouch, gestureOptions);
    return () => {
      root.removeEventListener("gesturestart", preventGesture);
      root.removeEventListener("gesturechange", preventGesture);
      root.removeEventListener("gestureend", preventGesture);
      root.removeEventListener("touchstart", preventMultiTouch);
      root.removeEventListener("touchmove", preventMultiTouch);
    };
  }, []);

  useEffect(() => {
    const clearTouchState = () => {
      stopMoveRepeat();
      if (touchInputRef.current.activeAction === "charge") {
        controllerRef.current?.cancelCharge();
      }
      touchInputRef.current = createTouchInputState();
    };
    const finishNativePointer = (event: PointerEvent, cancelled: boolean) => {
      const current = touchInputRef.current;
      if (current.activePointerId !== event.pointerId) return;
      const wasCharge = current.activeAction === "charge";
      if (current.activeAction === "move") stopMoveRepeat();
      touchInputRef.current = endTouchAction(current, event.pointerId);
      if (wasCharge) {
        if (cancelled) controllerRef.current?.cancelCharge();
        else controllerRef.current?.releaseCharge();
      }
    };
    const onWindowPointerUp = (event: PointerEvent) => {
      finishNativePointer(event, false);
    };
    const onWindowPointerCancel = (event: PointerEvent) => {
      finishNativePointer(event, true);
    };
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);
    window.addEventListener("blur", clearTouchState);
    window.addEventListener("pagehide", clearTouchState);
    document.addEventListener("visibilitychange", clearTouchState);
    return () => {
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerCancel);
      window.removeEventListener("blur", clearTouchState);
      window.removeEventListener("pagehide", clearTouchState);
      document.removeEventListener("visibilitychange", clearTouchState);
      stopMoveRepeat();
    };
  }, []);

  useEffect(() => {
    if (snapshot.mode !== "result") {
      resultSubmissionKeyRef.current = null;
      return;
    }
    if (!playerName) return;
    const resultKey = [
      snapshot.score,
      snapshot.elapsed,
      snapshot.wave,
      snapshot.rank,
      snapshot.reachedWave ?? 0,
    ].join(":");
    if (resultSubmissionKeyRef.current === resultKey) return;
    resultSubmissionKeyRef.current = resultKey;
    let active = true;
    setRanking([]);
    setRankingStatus("ランキング登録中…");
    void submitAndLoadRanking(snapshot.score, playerName)
      .then(rows => {
        if (!active) return;
        setRanking(rows);
        setRankingStatus("オンラインランキングに反映しました");
      })
      .catch(() => {
        if (!active) return;
        setRankingStatus("ランキングは現在利用できません（結果は表示されています）");
      });
    return () => {
      active = false;
    };
  }, [
    playerName,
    snapshot.elapsed,
    snapshot.mode,
    snapshot.rank,
    snapshot.reachedWave,
    snapshot.score,
    snapshot.wave,
  ]);

  const controller = controllerRef.current;
  const hpRatio = (snapshot.playerHp / snapshot.playerMaxHp) * 100;
  const crisisState =
    snapshot.mode === "battle" && hpRatio <= 15
      ? "critical"
      : snapshot.mode === "battle" && hpRatio <= 30
        ? "caution"
        : "normal";
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    controller?.setSoundEnabled?.(next);
  };
  const updateVolume = (value: number) => {
    setSoundVolume(value);
    controller?.setSoundVolume?.(value / 100);
  };
  const toggleVibration = () => {
    const next = !vibrationEnabled;
    setVibrationEnabled(next);
    controller?.setVibrationEnabled?.(next);
  };

  const beginPointerAction = (
    event: ReactPointerEvent<HTMLButtonElement>,
    action: TouchAction,
    callback: () => void,
  ) => {
    event.preventDefault();
    if (event.pointerType === "mouse") {
      callback();
      return;
    }
    const result = beginTouchAction(
      touchInputRef.current,
      event.pointerId,
      action,
      performance.now(),
    );
    if (!result.accepted) return;
    touchInputRef.current = result.state;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few embedded browsers.
    }
    if (action === "move") startMoveRepeat(callback);
    else callback();
  };

  const endPointerAction = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    event.preventDefault();
    if (event.pointerType === "mouse") {
      if (cancelled) controllerRef.current?.cancelCharge();
      else controllerRef.current?.releaseCharge();
      return;
    }
    const current = touchInputRef.current;
    if (current.activePointerId !== event.pointerId) return;
    const wasCharge = current.activeAction === "charge";
    if (current.activeAction === "move") stopMoveRepeat();
    touchInputRef.current = endTouchAction(current, event.pointerId);
    if (wasCharge) {
      if (cancelled) controllerRef.current?.cancelCharge();
      else controllerRef.current?.releaseCharge();
    }
  };

  const submitPlayerName = () => {
    const name = savePlayerName(nameDraft);
    if (!name) {
      setNameError("プレイヤー名を入力してください");
      return;
    }
    setPlayerName(name);
    setNameDraft(name);
    setNameError("");
    setNameShareStatus("");
  };

  const shareHome = () => {
    void shareOrCopy(homeShareText()).then(result => {
      setNameShareStatus(shareStatusText(result));
    });
  };

  return (
    <main
      className={`game-shell ${crisisState !== "normal" ? `is-${crisisState}` : ""}`}
      data-mode={snapshot.mode}
      onContextMenuCapture={preventNativeAction}
      onDoubleClickCapture={preventNativeAction}
      onDragStartCapture={preventNativeAction}
    >
      <canvas
        ref={canvasRef}
        className="game-canvas"
        style={{ touchAction: "none" }}
        aria-label="グリッド・シグナル・アリーナの戦闘フィールド"
      />
      {!playerName && (
        <NameGate
          draft={nameDraft}
          error={nameError}
          shareStatus={nameShareStatus}
          onDraftChange={value => {
            setNameDraft(value);
            if (nameError) setNameError("");
          }}
          onSubmit={submitPlayerName}
          onShare={shareHome}
        />
      )}
      {bootError && (
        <section
          className="startup-error"
          role="alert"
          aria-live="assertive"
        >
          <p className="eyebrow">接続失敗 / 起動停止</p>
          <h1>戦闘画面を読み込めませんでした</h1>
          <p>
            端末の描画準備を確認して、ページを再読み込みしてください。
          </p>
          <button
            type="button"
            className="engage-button"
            onClick={() => window.location.reload()}
          >
            再読み込み <span>↗</span>
          </button>
        </section>
      )}
      <div className="screen-noise" aria-hidden="true" />
      <div className="crisis-frame" aria-hidden="true" />
      <div className="signal-hud">
        <header className="terminal-brand">
          <img src={ASSET_URLS.mark} alt="グリッド・シグナル・アリーナ" />
          <div>
            <p>グリッド・シグナル</p>
            <strong>アリーナ</strong>
          </div>
          <span className="brand-node" />
        </header>
        {snapshot.mode === "battle" && (
          <button
            type="button"
            className="pause-button"
            onClick={() => controller?.togglePause()}
            aria-pressed={snapshot.paused}
            aria-label="一時停止メニューを開く"
          >
            {snapshot.paused ? "▶ 再開" : "Ⅱ 停止"}
          </button>
        )}

        <section
          className={`player-console technical-panel ${crisisState !== "normal" ? "is-crisis" : ""}`}
        >
          <p className="eyebrow">01 / 操作体情報 // ウェーブ 0{snapshot.wave}</p>
          <div className="metric-row">
            <span>耐久</span>
            <strong className={crisisState !== "normal" ? "is-crisis" : ""}>
              {String(snapshot.playerHp).padStart(3, "0")}
            </strong>
          </div>
          <div
            className={`meter hp-meter ${crisisState !== "normal" ? `is-${crisisState}` : ""}`}
          >
            <span style={meterStyle(hpRatio)} />
          </div>
          {crisisState !== "normal" && (
            <div className={`crisis-readout is-${crisisState}`}>
              <i />{" "}
              {crisisState === "critical"
                ? "危険 // 回避行動"
                : "注意 // 耐久低下"}
            </div>
          )}
          <div className="metric-row compact">
            <span>位置</span>
            <strong>
              {snapshot.playerGrid.col + 1} · {snapshot.playerGrid.row + 1}
            </strong>
          </div>
          <div className={`sync-status ${snapshot.sync ? "is-synced" : ""}`}>
            <i />{" "}
            {snapshot.sync
              ? "完全同期 // 次カード ×2"
              : snapshot.invincible
                ? `位相化 // ${snapshot.invincibleRemaining.toFixed(1)}秒`
                : snapshot.barrier > 0
                  ? `障壁 // ${snapshot.barrier}`
                  : "同期接続 // 待機"}
          </div>
          <div className={`emotion-status emotion-${snapshot.emotion}`}>
            <span>精神状態</span>
            <strong>{emotionLabels[snapshot.emotion]}</strong>
            {snapshot.emotionRemaining > 0 && (
              <small>{snapshot.emotionRemaining.toFixed(1)}秒</small>
            )}
            {snapshot.corruption > 0 && (
              <small>侵食 {snapshot.corruption}/3</small>
            )}
          </div>
        </section>

        <section className="enemy-console technical-panel">
          <p className="eyebrow">06 / 敵情報</p>
          {snapshot.enemies.map(enemy => (
            <div className="enemy-readout" key={enemy.id}>
              <div>
                <span className={`enemy-state state-${enemy.state}`} />{" "}
                <b>{enemy.name}</b>
              </div>
              <small>{enemyReadoutLabel(enemy)}</small>
              {enemy.warningStage && (
                <div
                  className={"enemy-warning is-" + enemy.warningStage}
                  role="status"
                  aria-label={
                    enemy.warningStage === "urgent"
                      ? "攻撃直前の危険予兆"
                      : "敵攻撃の予兆"
                  }
                >
                  <span>
                    {enemy.warningStage === "urgent" ? "危険" : "予兆"}
                  </span>
                  <div className="meter enemy-warning-meter">
                    <span
                      style={meterStyle((enemy.warningProgress ?? 0) * 100)}
                    />
                  </div>
                  <time>
                    {((enemy.warningRemainingMs ?? 0) / 1000).toFixed(1)}秒
                  </time>
                </div>
              )}
              <div className="meter enemy-meter">
                <span style={meterStyle((enemy.hp / enemy.maxHp) * 100)} />
              </div>
            </div>
          ))}
        </section>

        <section className="signal-log" aria-live="polite">
          <span className="log-pin" />
          <p>{snapshot.message}</p>
          <time>{timecode(snapshot.elapsed)}</time>
        </section>

        <section className="run-console technical-panel">
          <p className="eyebrow">プレイ記録</p>
          <div>
            <span>得点</span>
            <strong>{String(snapshot.score).padStart(5, "0")}</strong>
          </div>
          <small>
            最高得点 {String(snapshot.highScore).padStart(5, "0")} / 到達ウェーブ{" "}
            {String(snapshot.bestWave).padStart(2, "0")}
          </small>
        </section>

        {snapshot.mode === "battle" && (
          <>
            <section className="queue-console technical-panel">
              <p className="eyebrow">次のカード</p>
              {snapshot.queue.length > 0 ? (
                <>
                  <strong>{snapshot.queue[0].name}</strong>
                  <span>
                    {snapshot.sync || snapshot.emotion === "enraged"
                      ? snapshot.queue[0].power * 2
                      : snapshot.queue[0].power}{" "}
                    威力
                  </span>
                </>
              ) : (
                <strong className="empty-queue">送信済みカードなし</strong>
              )}
            </section>
            <section className="gauge-console technical-panel">
              <div className="metric-row">
                <span>カード選択まで</span>
                <strong>{snapshot.customRemaining.toFixed(1)}S</strong>
              </div>
              <div className="meter gauge-meter">
                <span style={meterStyle(snapshot.gauge)} />
              </div>
              <button
                type="button"
                disabled={
                  snapshot.gauge < 100 ||
                  snapshot.paused ||
                  snapshot.charging > 0
                }
                onClick={() => controller?.openCustom()}
              >
                カード選択
              </button>
            </section>
            <section className="skill-rail" aria-label="送信済みカード">
              {snapshot.queue.map((card, index) => (
                <div
                  className={`queued-card ${index === 0 ? "next" : ""} ${card.tier === "mega" ? "mega" : ""}`}
                  key={`${card.id}-${index}`}
                >
                  <em>
                    {index + 1} / {cardClassLabel(card)}
                  </em>
                  <span>{card.name}</span>
                  <b>{card.power}</b>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      {snapshot.mode === "custom" && (
        <section className="custom-console" aria-label="カスタムコンソール">
          <div
            className="reference-ghost"
            style={{ backgroundImage: `url(${ASSET_URLS.reference})` }}
            aria-hidden="true"
          />
          <div className="custom-topline">
            <span>
              カード選択 / ウェーブ 0{snapshot.wave} /{" "}
              {snapshot.elapsed > 0 ? "10秒後に再選択" : "初回選択"}
            </span>
            <span>
              手札 {String(snapshot.customHand.length).padStart(2, "0")} / 05
            </span>
          </div>
          <div className="custom-heading">
            <p>カードを選ぶ</p>
            <h1>
              次の一手を、
              <br />
              接続する。
            </h1>
            <span>
              同名、同じ接続コード、または共通コード*で最大5枚を送信できます。
            </span>
            <div className="card-inspector" aria-live="polite">
              {snapshot.focusedCard !== null ? (
                <>
                  <b>{snapshot.customHand[snapshot.focusedCard]?.name}</b>
                  <span>
                    {snapshot.customHand[snapshot.focusedCard]?.description}
                  </span>
                  <em>選択中。タップで解除</em>
                </>
              ) : (
                <span>カードを1回タップで選択。選択中のカードをタップで解除。</span>
              )}
            </div>
          </div>
          <div className="card-deck">
            {snapshot.customHand.map((card, index) => {
              const selected = snapshot.selected.includes(index);
              const focused = snapshot.focusedCard === index;
              const canJoin =
                selected ||
                validateSelection(snapshot.customHand, [
                  ...snapshot.selected,
                  index,
                ]).valid;
              const selectionOrder = snapshot.selected.indexOf(index) + 1;
              return (
                <button
                  type="button"
                  key={`${card.id}-${index}`}
                  className={`signal-card ${selected ? "selected" : ""} ${focused ? "focused" : ""} ${!canJoin ? "unavailable" : ""} ${card.tier === "mega" ? "mega-card" : ""} ${card.isOverload ? "overload-card" : ""}`}
                  onClick={() => controller?.toggleCard(index)}
                  aria-pressed={selected}
                  aria-label={`${card.name}。${selected ? "選択中、タップで解除" : canJoin ? "タップで選択" : "現在の選択条件では追加できません"}`}
                >
                  <span className="card-index">0{index + 1}</span>
                  {selected && (
                    <span className="selection-order">{selectionOrder}</span>
                  )}
                  <span className="card-lane">
                    {cardClassLabel(card)}
                  </span>
                  <strong>{card.name}</strong>
                  <small>
                    {canJoin ? card.description : "この選択には接続できません"}
                  </small>
                  <b>
                    {card.power}
                    <em>OUT</em>
                  </b>
                  <i>コード {card.selectedCode ?? card.code}</i>
                </button>
              );
            })}
          </div>
          <section
            className="custom-range-preview"
            aria-label="カード攻撃範囲プレビュー"
          >
            <div className="range-preview-label">
              <span>
                攻撃範囲 /{" "}
                {targetLabel(
                  snapshot.customHand[
                    snapshot.focusedCard ?? snapshot.selected[0] ?? 0
                  ]
                )}
              </span>
              <b>
                {snapshot.customHand[
                  snapshot.focusedCard ?? snapshot.selected[0] ?? 0
                ]?.name ?? "カード選択"}
              </b>
            </div>
            <div
              className={`range-board range-${snapshot.customHand[snapshot.focusedCard ?? snapshot.selected[0] ?? 0]?.target ?? "front"}`}
            >
              {Array.from({ length: 18 }, (_, index) => {
                const previewCard =
                  snapshot.customHand[
                    snapshot.focusedCard ?? snapshot.selected[0] ?? 0
                  ];
                const col = Math.floor(index / 3);
                const row = index % 3;
                const tileKey = `${col}:${row}`;
                const target = previewTargets(
                  previewCard,
                  snapshot.playerGrid,
                  snapshot.enemies,
                  snapshot.panels
                ).has(tileKey);
                const player =
                  col === snapshot.playerGrid.col &&
                  row === snapshot.playerGrid.row;
                return (
                  <span
                    className={`range-tile ${col <= 2 ? "ally" : "enemy"} ${target ? "target animated-target" : ""} ${player ? "player" : ""}`}
                    style={
                      target
                        ? {
                            animationDelay: `${previewDelay(previewCard, col, row, snapshot.playerGrid, snapshot.enemies)}ms`,
                          }
                        : undefined
                    }
                    key={tileKey}
                  >
                    {player && <i>P</i>}
                  </span>
                );
              })}
            </div>
            <small>
              <b className="range-vector">
                {previewVector(
                  snapshot.customHand[
                    snapshot.focusedCard ?? snapshot.selected[0] ?? 0
                  ]
                )}
              </b>{" "}
              現在位置（P）
              から、説明中または選択中のカードが作用する対象マスを順に走査
            </small>
          </section>
          <div className="custom-footer">
            <p>
              <span>{snapshot.selected.length}</span> / 05枚を選択中
              {snapshot.selectionError && (
                <small>{snapshot.selectionError}</small>
              )}
            </p>
            <div className="custom-footer-actions">
              <button type="button" onClick={() => setFolderEditorOpen(true)}>
                フォルダ編集
              </button>
              {snapshot.wave === 1 && snapshot.elapsed === 0 && (
                <button
                  type="button"
                  onClick={() => controller?.startPractice()}
                >
                  練習モード
                </button>
              )}
              <button
                type="button"
                className="engage-button"
                onClick={() => controller?.confirmCustom()}
              >
                戦闘へ戻る <span>↗</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {snapshot.mode === "battle" && (
        <div className="mobile-controls" aria-label="タッチ操作">
          <div className="dpad dpad-large">
            <button
              type="button"
              aria-label="上へ移動"
              onPointerDown={event =>
                beginPointerAction(event, "move", () =>
                  controllerRef.current?.move(0, 1),
                )
              }
              onPointerUp={event => endPointerAction(event)}
              onPointerCancel={event => endPointerAction(event, true)}
              onLostPointerCapture={event => endPointerAction(event, true)}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="左へ移動"
              onPointerDown={event =>
                beginPointerAction(event, "move", () =>
                  controllerRef.current?.move(-1, 0),
                )
              }
              onPointerUp={event => endPointerAction(event)}
              onPointerCancel={event => endPointerAction(event, true)}
              onLostPointerCapture={event => endPointerAction(event, true)}
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="右へ移動"
              onPointerDown={event =>
                beginPointerAction(event, "move", () =>
                  controllerRef.current?.move(1, 0),
                )
              }
              onPointerUp={event => endPointerAction(event)}
              onPointerCancel={event => endPointerAction(event, true)}
              onLostPointerCapture={event => endPointerAction(event, true)}
            >
              ▶
            </button>
            <button
              type="button"
              aria-label="下へ移動"
              onPointerDown={event =>
                beginPointerAction(event, "move", () =>
                  controllerRef.current?.move(0, -1),
                )
              }
              onPointerUp={event => endPointerAction(event)}
              onPointerCancel={event => endPointerAction(event, true)}
              onLostPointerCapture={event => endPointerAction(event, true)}
            >
              ▼
            </button>
          </div>
          <div className="action-buttons">
            <button
              type="button"
              className="action-fire"
              onPointerDown={event =>
                beginPointerAction(event, "fire", () =>
                  controllerRef.current?.fire(),
                )
              }
              onPointerUp={event => endPointerAction(event)}
              onPointerCancel={event => endPointerAction(event, true)}
              onLostPointerCapture={event => endPointerAction(event, true)}
              aria-label="通常攻撃"
            >
              攻撃
            </button>
            <button
              type="button"
              className="action-charge"
              onPointerDown={event =>
                beginPointerAction(event, "charge", () =>
                  controllerRef.current?.startCharge(),
                )
              }
              onPointerUp={event => endPointerAction(event)}
              onPointerCancel={event => endPointerAction(event, true)}
              onLostPointerCapture={event => endPointerAction(event, true)}
              aria-label="チャージショット"
            >
              溜め
            </button>
            <button
              type="button"
              className="action-skill"
              onPointerDown={event =>
                beginPointerAction(event, "skill", () =>
                  controllerRef.current?.useSkill(),
                )
              }
              onPointerUp={event => endPointerAction(event)}
              onPointerCancel={event => endPointerAction(event, true)}
              onLostPointerCapture={event => endPointerAction(event, true)}
              aria-label="次のカードを使用"
            >
              カード
            </button>
          </div>
          <div className="charge-indicator">
            <span style={meterStyle(snapshot.charging * 100)} />
          </div>
        </div>
      )}

      {snapshot.mode === "battle" && snapshot.paused && (
        <section
          className="pause-console"
          aria-modal="true"
          role="dialog"
          aria-label="一時停止と設定"
        >
          <p className="eyebrow">戦闘停止 / 設定</p>
          <h2>
            戦闘を
            <br />
            一時停止中
          </h2>
          <div className="pause-settings">
            <button
              type="button"
              className="sound-toggle"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
            >
              効果音 {soundEnabled ? "有効" : "無効"}
            </button>
            <label className="volume-control">
              音量{" "}
              <input
                type="range"
                min="0"
                max="100"
                value={soundVolume}
                onChange={event => updateVolume(Number(event.target.value))}
                aria-label="効果音の音量"
                disabled={!soundEnabled}
              />
            </label>
            <button
              type="button"
              className="vibration-toggle"
              onClick={toggleVibration}
              aria-pressed={vibrationEnabled}
            >
              振動 {vibrationEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <button
            type="button"
            className="engage-button"
            onClick={() => controller?.togglePause()}
          >
            再開 <span>↗</span>
          </button>
        </section>
      )}

      {snapshot.mode === "intermission" && (
        <section className="result-console wave-clear" aria-live="polite">
          <p className="eyebrow">ウェーブ 0{snapshot.wave} / クリア</p>
          <h2>
            次のウェーブへ
            <br />
            進みます
          </h2>
          <div className="wave-reward">
            <span>耐久回復</span>
            <strong>+{snapshot.lastWaveRecovery ?? 0}</strong>
            <small>ウェーブ 0{snapshot.wave + 1} 準備完了</small>
          </div>
          <div className="result-details">
            <span>
              ウェーブ獲得 <b>+{snapshot.lastWaveScore?.total ?? 0}</b>
            </span>
            <span>
              合計スコア <b>{snapshot.score}</b>
            </span>
          </div>
          <button
            type="button"
            className="engage-button"
            onClick={() => controller?.nextWave()}
          >
            次のウェーブへ <span>↗</span>
          </button>
        </section>
      )}

      {snapshot.mode === "result" && (
        <ResultScreen
          snapshot={snapshot}
          playerName={playerName}
          ranking={ranking}
          rankingStatus={rankingStatus}
          onRestart={() => controller?.restart()}
          onFolderEdit={() => setFolderEditorOpen(true)}
          onHome={() => controller?.restart()}
        />
      )}

      {snapshot.mode === "practice" && (
        <Tutorial
          stage={snapshot.practiceStage ?? 1}
          onNext={() => controller?.nextPracticeStage()}
          onExit={() => controller?.exitPractice()}
        />
      )}

      {folderEditorOpen && (
        <FolderEditor
          onClose={() => setFolderEditorOpen(false)}
          onSaved={() => {
            controllerRef.current?.reloadFolder?.();
            setFolderEditorOpen(false);
          }}
        />
      )}

      <footer className="control-guide">
        <span>
          <b>移動</b> WASD / 矢印キー
        </span>
        <span>
          <b>通常攻撃</b> Z / 正面直線
        </span>
        <span>
          <b>チャージ</b> スペース長押し＋移動
        </span>
        <span>
          <b>カード</b> X
        </span>
        <span>
          <b>カード選択</b> 10秒
        </span>
      </footer>
    </main>
  );
}
