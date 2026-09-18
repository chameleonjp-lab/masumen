/** Signal Relay Tactical component: the React frame supplies a clipped industrial HUD while Babylon owns the live arena. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { ASSET_URLS } from "@/game/assets";
import {
  canAppendSelection,
  CARD_OFFER_SIZE,
  MAX_CARD_SELECTION,
} from "@/game/deck";
import { COMBAT_BALANCE } from "@/game/data/balance";
import { createGameEngine } from "@/game/engine";
import { startGameRuntime, type StartupState } from "@/game/startup";
import { StartupGate } from "@/components/game/StartupScreen";
import { cardPreviewTiles, nearestEnemyPosition } from "@/game/data/cardCombatData";
import { cardPresentation } from "@/game/cardPresentation";
import { createGameScene } from "@/game/scene";
import type { BattleSnapshot, GameHandle, GridPosition } from "@/game/types";
import ResultScreen from "@/components/game/ResultScreen";
import { createMovementRepeat, type MovementRepeat } from "@/game/movementRepeat";
import {
  beginTouchAction,
  createTouchInputState,
  endTouchAction,
  touchActionForPointer,
  type TouchAction,
} from "@/game/touchInputGuard";
import {
  homeShareText,
  LAB_URL,
  finishMasumenPlay,
  loadRanking,
  readPlayerName,
  resultShareText,
  savePlayerName,
  shareOrCopy,
  shareStatusText,
  startMasumenPlay,
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
  charging: 0,
  barrier: 0,
  invincible: false,
  invincibleRemaining: 0,
  customHand: [],
  customHandNumber: 1,
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
  customRemaining: 20,
};

const CARD_SELECTION_INTERVAL_SECONDS =
  COMBAT_BALANCE.custom.intervalMs / 1000;

function meterStyle(value: number) {
  return { transform: `scaleX(${Math.max(0, Math.min(1, value / 100))})` };
}

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

function enemyDefenseHint(
  enemy: BattleSnapshot["enemies"][number]
): string | null {
  // P1-8: make the guard exception visible where the player analyzes the enemy.
  if (enemy.defense !== "guard") return null;
  return "待機中: カード無効 / 通常弾・破砕カード有効";
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
  starting: boolean;
  shareStatus: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onShare: () => void;
}

type KeyboardAction = "fire" | "charge" | "skill";
type KeyboardBindings = Record<KeyboardAction, string>;

const KEYBOARD_BINDINGS_KEY = "grid-signal-arena-keyboard-v1";
const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings = {
  fire: "z",
  charge: " ",
  skill: "x",
};
const RESERVED_KEYBOARD_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "enter",
  "escape",
  "tab",
]);

function normaliseKey(value: string): string {
  return value === " " ? value : value.toLowerCase();
}

function readKeyboardBindings(): KeyboardBindings {
  if (typeof window === "undefined") return { ...DEFAULT_KEYBOARD_BINDINGS };
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(KEYBOARD_BINDINGS_KEY) ?? "null"
    ) as Partial<KeyboardBindings> | null;
    return {
      fire: typeof saved?.fire === "string" ? normaliseKey(saved.fire) : DEFAULT_KEYBOARD_BINDINGS.fire,
      charge: typeof saved?.charge === "string" ? normaliseKey(saved.charge) : DEFAULT_KEYBOARD_BINDINGS.charge,
      skill: typeof saved?.skill === "string" ? normaliseKey(saved.skill) : DEFAULT_KEYBOARD_BINDINGS.skill,
    };
  } catch {
    return { ...DEFAULT_KEYBOARD_BINDINGS };
  }
}

function writeKeyboardBindings(bindings: KeyboardBindings): void {
  try {
    window.localStorage.setItem(KEYBOARD_BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    // Private browsing may deny local storage; the current session still works.
  }
}

function isPcPlatform(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return navigator.maxTouchPoints === 0 && !coarsePointer;
}

function keyboardLabel(key: string): string {
  if (key === " ") return "スペース";
  if (key === "arrowup") return "上矢印";
  if (key === "arrowdown") return "下矢印";
  if (key === "arrowleft") return "左矢印";
  if (key === "arrowright") return "右矢印";
  return key.length === 1 ? key.toUpperCase() : key;
}

interface KeyboardBindingPanelProps {
  bindings: KeyboardBindings;
  capturing: KeyboardAction | null;
  captureError: string;
  onCapture: (action: KeyboardAction) => void;
}

function KeyboardBindingPanel({
  bindings,
  capturing,
  captureError,
  onCapture,
}: KeyboardBindingPanelProps) {
  const rows: ReadonlyArray<[KeyboardAction, string]> = [
    ["fire", "通常攻撃"],
    ["charge", "チャージ"],
    ["skill", "カード使用"],
  ];
  return (
    <section className="keyboard-bindings" aria-label="キーボード設定">
      <p className="eyebrow">PC操作 / キー設定</p>
      <small>ボタンを押してから、割り当てたいキーを押してください。</small>
      {captureError && <small className="keyboard-binding-error" role="status">{captureError}</small>}
      <div className="keyboard-binding-list">
        {rows.map(([action, label]) => (
          <div className="keyboard-binding-row" key={action}>
            <span>{label}</span>
            <button type="button" onClick={() => onCapture(action)}>
              {capturing === action ? "キー入力待ち" : keyboardLabel(bindings[action])}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function NameGate({
  draft,
  error,
  starting,
  shareStatus,
  onDraftChange,
  onSubmit,
  onShare,
}: NameGateProps) {
  return (
    <section className="name-gate" role="dialog" aria-modal="true" aria-labelledby="name-gate-title">
      <div className="name-gate__panel technical-panel">
        <p className="eyebrow">プレイヤー登録</p>
        <h1 id="name-gate-title">名前を入力して開始</h1>
        <p className="name-gate__copy">
          プレイヤー名を登録すると、戦闘結果をランキングへ送信できます。
        </p>
        <label className="name-gate__label" htmlFor="masumen-player-name">
          プレイヤー名（必須）
        </label>
        <input
          id="masumen-player-name"
          className="name-gate__input"
          value={draft}
          maxLength={20}
          required
          autoComplete="nickname"
          autoFocus
          placeholder="名前を入力"
          aria-invalid={Boolean(error)}
          aria-describedby="masumen-player-name-status"
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <p id="masumen-player-name-status" className="name-gate__status" role="status" aria-live="polite">
          {starting ? "プレイ開始を記録しています…" : error || "名前を入力してからカード選択を開始してください"}
        </p>
        <button type="button" className="engage-button name-gate__submit" onClick={onSubmit} disabled={starting}>
          {starting ? "開始処理中…" : "カード選択へ進む"} <span>↗</span>
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
  const cardDeckRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const controllerRef = useRef<GameHandle["controller"] | null>(null);
  const [snapshot, setSnapshot] = useState<BattleSnapshot>(initialSnapshot);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(70);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [startup, setStartup] = useState<StartupState>({ status: "loading", stage: "engine" });
  const [playerName, setPlayerName] = useState(() => readPlayerName());
  const [entryScreen, setEntryScreen] = useState<"name" | "game">("name");
  const [centerCardIndex, setCenterCardIndex] = useState(0);
  const inputReadyRef = useRef(false);
  const keyboardBindingsRef = useRef<KeyboardBindings>(readKeyboardBindings());
  inputReadyRef.current =
    startup.status === "ready" &&
    entryScreen === "game" &&
    Boolean(playerName);
  const [nameDraft, setNameDraft] = useState(() => readPlayerName());
  const [nameError, setNameError] = useState("");
  const [nameShareStatus, setNameShareStatus] = useState("");
  const [startingPlay, setStartingPlay] = useState(false);
  const [keyboardBindings, setKeyboardBindings] = useState<KeyboardBindings>(
    () => keyboardBindingsRef.current
  );
  const [capturingKey, setCapturingKey] = useState<KeyboardAction | null>(null);
  const [captureError, setCaptureError] = useState("");
  const pcPlatform = isPcPlatform();
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [rankingStatus, setRankingStatus] = useState("ランキング登録：待機中");
  const [rankingRetryToken, setRankingRetryToken] = useState(0);
  const resultSubmissionKeyRef = useRef<string | null>(null);
  const playIdRef = useRef<string | null>(null);
  const playStartPromiseRef = useRef<Promise<void> | null>(null);
  const touchInputRef = useRef(createTouchInputState());
  const moveRepeatRef = useRef<MovementRepeat | null>(null);
  const customHandKey = snapshot.customHand
    .map(card => `${card.instanceId}:${card.id}`)
    .join("|");

  const updateCenteredCard = useCallback(() => {
    const deck = cardDeckRef.current;
    if (!deck) return;
    const deckRect = deck.getBoundingClientRect();
    const centerX = deckRect.left + deckRect.width / 2;
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    Array.from(deck.querySelectorAll<HTMLElement>("[data-card-index]")).forEach(card => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - centerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = Number(card.dataset.cardIndex);
      }
    });
    if (nearestIndex >= 0)
      setCenterCardIndex(current => current === nearestIndex ? current : nearestIndex);
  }, []);

  const centerCard = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const deck = cardDeckRef.current;
    const card = deck?.querySelector<HTMLElement>(`[data-card-index="${index}"]`);
    if (!deck || !card) return;
    const left = card.offsetLeft - (deck.clientWidth - card.offsetWidth) / 2;
    deck.scrollTo({ left: Math.max(0, left), behavior });
    setCenterCardIndex(index);
  }, []);

  const stopMoveRepeat = () => {
    moveRepeatRef.current?.stop();
    moveRepeatRef.current = null;
  };

  const startMoveRepeat = (callback: () => void) => {
    if (!moveRepeatRef.current)
      moveRepeatRef.current = createMovementRepeat();
    moveRepeatRef.current.start(callback);
  };

  // A modal transition can remove the pressed button before Safari emits its
  // pointerup/lostpointercapture event. Clear the ownership state together
  // with the repeat timer so the next battle cannot inherit a dead finger.
  const resetPointerInput = () => {
    stopMoveRepeat();
    if (touchInputRef.current.chargePointerId !== null) {
      controllerRef.current?.cancelCharge();
    }
    touchInputRef.current = createTouchInputState();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    let disposed = false;
    const disposeRuntime = startGameRuntime({
      createEngine: () => createGameEngine(canvas),
      createScene: engine => createGameScene(engine, canvas, {
        canAcceptInput: () => inputReadyRef.current,
        getKeyboardBindings: () => keyboardBindingsRef.current,
        onSnapshot: nextSnapshot => {
          if (disposed) return;
          if ((nextSnapshot.mode !== "battle" && nextSnapshot.mode !== "practice") || nextSnapshot.paused)
            resetPointerInput();
          setSnapshot(nextSnapshot);
        },
      }),
      onReady: createdHandle => {
        controllerRef.current = createdHandle.controller;
        createdHandle.controller.setSoundEnabled?.(soundEnabled);
        createdHandle.controller.setSoundVolume?.(soundVolume / 100);
        createdHandle.controller.setVibrationEnabled?.(vibrationEnabled);
      },
      onState: state => {
        if (disposed) return;
        if (state.status === "failed") controllerRef.current = null;
        setStartup(state);
      },
      attachResize: engine => {
        const onResize = () => engine.resize();
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", onResize);
        window.visualViewport?.addEventListener("resize", onResize);
        const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
        resizeObserver?.observe(canvas);
        return () => {
          window.removeEventListener("resize", onResize);
          window.removeEventListener("orientationchange", onResize);
          window.visualViewport?.removeEventListener("resize", onResize);
          resizeObserver?.disconnect();
        };
      },
    });
    return () => {
      disposed = true;
      inputReadyRef.current = false;
      disposeRuntime();
      controllerRef.current = null;
      startedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!capturingKey) return;
    const capture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setCapturingKey(null);
        setCaptureError("");
        return;
      }
      const key = normaliseKey(event.key);
      if (RESERVED_KEYBOARD_KEYS.has(key)) {
        event.preventDefault();
        event.stopPropagation();
        setCaptureError("矢印キーと決定キーは移動・選択に使うため設定できません。");
        return;
      }
      const conflict = (Object.entries(keyboardBindingsRef.current) as Array<[KeyboardAction, string]>)
        .find(([action, binding]) => action !== capturingKey && binding === key);
      if (conflict) {
        event.preventDefault();
        event.stopPropagation();
        setCaptureError(`そのキーは${conflict[0] === "fire" ? "通常攻撃" : conflict[0] === "charge" ? "チャージ" : "カード使用"}に設定済みです。`);
        return;
      }
      const next = { ...keyboardBindingsRef.current, [capturingKey]: key };
      keyboardBindingsRef.current = next;
      setKeyboardBindings(next);
      writeKeyboardBindings(next);
      setCapturingKey(null);
      setCaptureError("");
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturingKey]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const gestureOptions: AddEventListenerOptions = { passive: false };
    const preventGesture = (event: Event) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    root.addEventListener("gesturestart", preventGesture, gestureOptions);
    root.addEventListener("gesturechange", preventGesture, gestureOptions);
    root.addEventListener("gestureend", preventGesture, gestureOptions);
    return () => {
      root.removeEventListener("gesturestart", preventGesture);
      root.removeEventListener("gesturechange", preventGesture);
      root.removeEventListener("gestureend", preventGesture);
    };
  }, []);

  useEffect(() => {
    const clearTouchState = resetPointerInput;
    const finishNativePointer = (event: PointerEvent, cancelled: boolean) => {
      const current = touchInputRef.current;
      const action = touchActionForPointer(current, event.pointerId);
      if (action === null) return;
      const wasCharge = action === "charge";
      if (action === "move") stopMoveRepeat();
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
      snapshot.outcome,
      snapshot.reachedWave ?? 0,
    ].join(":");
    if (resultSubmissionKeyRef.current === resultKey) return;
    resultSubmissionKeyRef.current = resultKey;
    let active = true;
    setRanking([]);
    const playId = playIdRef.current;
    const resultType = snapshot.outcome === "victory" ? "clear" : "game_over";
    const rankingRequest = playId
      ? finishMasumenPlay({
          playId,
          playerName,
          resultType,
          reachedWave: snapshot.reachedWave ?? snapshot.wave,
          score: snapshot.score,
        }).then(() => loadRanking())
      : submitAndLoadRanking(snapshot.score, playerName);
    setRankingStatus("ランキングを読み込み中…");
    void rankingRequest
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
    snapshot.outcome,
    snapshot.rank,
    snapshot.reachedWave,
    snapshot.score,
    snapshot.wave,
    rankingRetryToken,
  ]);

  useEffect(() => {
    if (snapshot.mode !== "custom" || snapshot.customHand.length === 0) return;
    setCenterCardIndex(0);
    const frame = window.requestAnimationFrame(() => {
      centerCard(0, "auto");
      updateCenteredCard();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [centerCard, customHandKey, snapshot.customHand.length, snapshot.customHandNumber, snapshot.mode, snapshot.wave, updateCenteredCard]);

  const controller = controllerRef.current;
  const isCombatMode = snapshot.mode === "battle";
  const hpRatio = (snapshot.playerHp / snapshot.playerMaxHp) * 100;
  const crisisState =
    isCombatMode && hpRatio <= 15
      ? "critical"
      : isCombatMode && hpRatio <= 30
        ? "caution"
        : "normal";
  const activeCardIndex = snapshot.mode === "custom" ? centerCardIndex : snapshot.focusedCard;
  const previewCardIndex = snapshot.mode === "custom"
    ? centerCardIndex
    : snapshot.focusedCard ?? snapshot.selected[0] ?? 0;
  const previewCard = snapshot.customHand[previewCardIndex];
  const previewPresentation = cardPresentation(previewCard);
  const customCountdownSeconds = Math.max(0, snapshot.customRemaining);
  const customCountdownPercent =
    (customCountdownSeconds / CARD_SELECTION_INTERVAL_SECONDS) * 100;
  const focusedCard =
    activeCardIndex === null
      ? undefined
      : snapshot.customHand[activeCardIndex];
  const focusedPresentation = cardPresentation(focusedCard);
  const focusedSelected =
    activeCardIndex !== null && snapshot.selected.includes(activeCardIndex);
  const focusedCanJoin =
    activeCardIndex !== null &&
    canAppendSelection(snapshot.customHand, snapshot.selected, activeCardIndex);
  const nextQueuedCard = snapshot.queue[0];
  const nextQueuedPresentation = cardPresentation(nextQueuedCard);
  const cardVisualStyle = (presentation: ReturnType<typeof cardPresentation>) =>
    ({
      "--card-accent": presentation.accent,
      "--card-secondary": presentation.secondary,
    }) as CSSProperties;
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
    const action = touchActionForPointer(current, event.pointerId);
    if (action === null) return;
    const wasCharge = action === "charge";
    if (action === "move") stopMoveRepeat();
    touchInputRef.current = endTouchAction(current, event.pointerId);
    if (wasCharge) {
      if (cancelled) controllerRef.current?.cancelCharge();
      else controllerRef.current?.releaseCharge();
    }
  };

  const beginMasumenPlay = async (name: string) => {
    if (playStartPromiseRef.current) return;
    playIdRef.current = null;
    setStartingPlay(true);
    const request = startMasumenPlay(name)
      .then(playId => {
        playIdRef.current = playId;
      })
      .catch(() => {
        // The game remains playable when the ranking service is temporarily unavailable.
        // Completed results use the legacy submission path as a fallback.
        playIdRef.current = null;
      })
      .finally(() => {
        playStartPromiseRef.current = null;
        setStartingPlay(false);
      });
    playStartPromiseRef.current = request;
    await request;
    setEntryScreen("game");
    controllerRef.current?.restart();
  };

  const submitPlayerName = () => {
    if (startingPlay) return;
    const name = savePlayerName(nameDraft);
    if (!name) {
      setNameError("プレイヤー名を入力してください");
      return;
    }
    setPlayerName(name);
    setNameDraft(name);
    setNameError("");
    setNameShareStatus("");
    void beginMasumenPlay(name);
  };

  const returnHome = () => {
    resetPointerInput();
    playIdRef.current = null;
    controllerRef.current?.restart();
    setNameDraft(playerName);
    setNameError("");
    setEntryScreen("name");
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
        aria-label="マスメンの戦闘フィールド"
      />
      <StartupGate
        state={startup}
        hasName={entryScreen === "game" && Boolean(playerName)}
        nameGate={
          <NameGate
            draft={nameDraft}
            error={nameError}
            starting={startingPlay}
            shareStatus={nameShareStatus}
            onDraftChange={value => {
              setNameDraft(value);
              if (nameError) setNameError("");
            }}
            onSubmit={submitPlayerName}
            onShare={shareHome}
          />
        }
      >
      <div className="screen-noise" aria-hidden="true" />
      <div className="signal-hud">
        <header className="terminal-brand">
          <img src={ASSET_URLS.mark} alt="マスメン" />
          <div>
            <p>5ウェーブ・バトル</p>
            <strong>マスメン</strong>
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
              : snapshot.playerBlindRemaining && snapshot.playerBlindRemaining > 0
                ? `視界遮断 // ${snapshot.playerBlindRemaining.toFixed(1)}秒`
                : snapshot.barrier > 0
                  ? `障壁 // ${snapshot.barrier}`
                  : "同期接続 // 待機"}
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
              {enemy.defense === "guard" && (
                <small className="enemy-defense-hint">
                  {enemyDefenseHint(enemy)}
                </small>
              )}
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

        {isCombatMode && (
          <section
            className={`custom-countdown technical-panel ${customCountdownSeconds <= 5 ? "is-urgent" : ""}`}
            aria-label="カード選択までのカウントダウン"
          >
            <div className="custom-countdown-heading">
              <span>次のカード選択まで</span>
              <strong>{customCountdownSeconds.toFixed(1)}秒</strong>
            </div>
            <div
              className="meter custom-countdown-meter"
              role="progressbar"
              aria-label="カード選択までの残り時間"
              aria-valuemin={0}
              aria-valuemax={CARD_SELECTION_INTERVAL_SECONDS}
              aria-valuenow={customCountdownSeconds}
              aria-valuetext={`カード選択まで${customCountdownSeconds.toFixed(1)}秒`}
            >
              <span style={meterStyle(customCountdownPercent)} />
            </div>
          </section>
        )}

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

        {isCombatMode && (
          <>
            <section className="queue-console technical-panel">
              <p className="eyebrow">次のカード</p>
              {snapshot.queue.length > 0 ? (
                <>
                  <div
                    className="queued-card-summary"
                    style={cardVisualStyle(nextQueuedPresentation)}
                  >
                    <span className="card-sigil" aria-hidden="true">
                      {nextQueuedPresentation.glyph}
                    </span>
                    <div>
                      <strong>{nextQueuedCard?.name}</strong>
                      <small>
                        {nextQueuedPresentation.signatureLabel} / {nextQueuedPresentation.targetLabel}
                      </small>
                    </div>
                  </div>
                  <span>
                    {snapshot.sync
                      ? nextQueuedCard?.power
                        ? `威力 ${nextQueuedCard.power * 2}`
                        : nextQueuedPresentation.impactLabel
                      : nextQueuedPresentation.impactLabel}
                  </span>
                </>
              ) : (
                <strong className="empty-queue">送信済みカードなし</strong>
              )}
            </section>
            <section className="skill-rail" aria-label="送信済みカード">
              {snapshot.queue.map((card, index) => {
                const presentation = cardPresentation(card);
                return (
                  <div
                    className={`queued-card ${index === 0 ? "next" : ""} ${card.tier === "mega" ? "mega" : ""}`}
                    key={`${card.id}-${index}`}
                    style={cardVisualStyle(presentation)}
                  >
                    <em>
                      {index + 1} / {cardClassLabel(card)}
                    </em>
                    <span className="queued-card-name">
                      <i className="card-sigil" aria-hidden="true">
                        {presentation.glyph}
                      </i>
                      {card.name}
                    </span>
                    <small>{presentation.signatureLabel}</small>
                    <b>{card.power > 0 ? card.power : "補助"}</b>
                  </div>
                );
              })}
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
              {snapshot.elapsed > 0 ? "20秒後に再選択" : "初回選択"}
            </span>
            <span>
              提示 {String(snapshot.customHandNumber).padStart(2, "0")} / {CARD_OFFER_SIZE}枚
            </span>
          </div>
          <div className="custom-heading">
            <p>カードを選ぶ</p>
            <h1>
              次のカードを
              <br />
              選びます。
            </h1>
            <span>
              表示された10枚を横にスライドして確認し、1〜5枚を選べます。選択した順番に使用します。
            </span>
          </div>
          <div
            ref={cardDeckRef}
            className="card-deck card-deck-horizontal"
            aria-label="表示された10枚。横にスライドして確認できます。"
            onScroll={updateCenteredCard}
          >
            {snapshot.customHand.map((card, index) => {
              const presentation = cardPresentation(card);
              const selected = snapshot.selected.includes(index);
              const focused = centerCardIndex === index;
              const canJoin =
                selected ||
                canAppendSelection(snapshot.customHand, snapshot.selected, index);
              const selectionOrder = snapshot.selected.indexOf(index) + 1;
              const selectionStatus = selected
                ? `選択中・${selectionOrder}枚目`
                : canJoin
                  ? "選択できます"
                  : "5枚選択済み";
              const selectionMessage = selected
                ? "選択中。もう一度押すと解除できます"
                : canJoin
                  ? "押して選択できます"
                  : "選択上限の5枚に達しています";
              const descriptionId = `card-description-${card.id}-${index}`;
              return (
                <button
                  type="button"
                  key={`${card.id}-${index}`}
                  data-card-index={index}
                  className={`signal-card ${selected ? "selected" : ""} ${focused ? "focused" : ""} ${!canJoin ? "unavailable" : ""} ${card.tier === "mega" ? "mega-card" : ""} ${card.isOverload ? "overload-card" : ""}`}
                  style={cardVisualStyle(presentation)}
                  onClick={event => {
                    centerCard(index);
                    controller?.toggleCard(index);
                    event.currentTarget.focus({ preventScroll: true });
                  }}
                  aria-pressed={selected}
                  aria-current={focused ? "true" : undefined}
                  aria-describedby={descriptionId}
                  aria-label={`${card.name}。${presentation.summary}。${selectionMessage}`}
                >
                  <span className="card-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`card-state ${selected ? "is-selected" : ""} ${!canJoin ? "is-unavailable" : ""}`}
                  >
                    {selectionStatus}
                  </span>
                  <span className="card-heading">
                    <span className="card-sigil" aria-hidden="true">
                      {presentation.glyph}
                    </span>
                    <span className="card-lane">{cardClassLabel(card)}</span>
                  </span>
                  <strong>{card.name}</strong>
                  <span className="card-signature">{presentation.signatureLabel}</span>
                  <div className="card-tags" aria-label="カードの特徴">
                    <span>{presentation.propertyLabel}</span>
                    <span>{presentation.targetLabel}</span>
                  </div>
                  <small id={descriptionId}>{presentation.summary}</small>
                  <div className="card-stats" aria-label="カードの数値">
                    <span>{presentation.impactLabel}</span>
                    {presentation.hitLabel && <span>{presentation.hitLabel}</span>}
                    {presentation.statusLabel && <span>{presentation.statusLabel}</span>}
                    {presentation.durationLabel && <span>{presentation.durationLabel}</span>}
                  </div>
                  <i>選択順に使用</i>
                </button>
              );
            })}
          </div>
          <div className="card-inspector card-inspector-bottom" aria-label="中央カードの効果" aria-live="polite">
            {focusedCard ? (
              <>
                <b>{focusedCard.name}</b>
                <span>{focusedPresentation.summary}</span>
                <small>
                  {focusedPresentation.impactLabel} / {focusedPresentation.targetLabel}
                </small>
                <em>
                  {focusedSelected
                    ? "選択中。再度押すと解除できます"
                    : focusedCanJoin
                      ? "中央のカード。押して選択できます"
                      : "選択上限の5枚に達しています"}
                </em>
              </>
            ) : (
              <span>中央に表示されたカードの効果を確認できます。</span>
            )}
          </div>
          <section
            className="custom-range-preview"
            aria-label="カード攻撃範囲プレビュー"
          >
            <div className="range-preview-label">
              <span>作用範囲 / {previewPresentation.targetLabel}</span>
              <b>
                {previewCard?.name ?? "カード選択"}
              </b>
              <em>{previewPresentation.signatureLabel}</em>
            </div>
            <div
              className={`range-board range-${previewCard?.target ?? "front"}`}
            >
              {Array.from({ length: 18 }, (_, index) => {
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
                    {player && <i>自</i>}
                  </span>
                );
              })}
            </div>
            <small>
              <b className="range-vector">
                {previewVector(previewCard)}
              </b>{" "}
              自分から{previewPresentation.targetLabel}へ作用します。赤く光るマスが対象です。
            </small>
          </section>
          <div className="custom-footer">
            <p>
              <span>{snapshot.selected.length}</span> / {MAX_CARD_SELECTION}枚を選択中
              {snapshot.selectionError && (
                <small>{snapshot.selectionError}</small>
              )}
            </p>
            <div className="custom-footer-actions">
              <button
                type="button"
                className="engage-button"
                disabled={snapshot.selected.length < 1}
                onClick={() => controller?.confirmCustom()}
              >
                戦闘を開始 <span>↗</span>
              </button>
            </div>
            {snapshot.selected.length < 1 && (
              <small className="selection-required">1枚以上選択してください。</small>
            )}
          </div>
        </section>
      )}

      {isCombatMode && (
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
              aria-label="カードを使用"
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
              振動 {vibrationEnabled ? "有効" : "無効"}
            </button>
          </div>
          {pcPlatform && (
            <KeyboardBindingPanel
              bindings={keyboardBindings}
              capturing={capturingKey}
              captureError={captureError}
              onCapture={action => {
                setCaptureError("");
                setCapturingKey(action);
              }}
            />
          )}
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
          onRestart={() => {
            if (playerName) void beginMasumenPlay(playerName);
          }}
          onHome={returnHome}
          onRetryRanking={() => {
            resultSubmissionKeyRef.current = null;
            setRankingRetryToken(token => token + 1);
          }}
        />
      )}

      <footer className="control-guide">
        <span>
          <b>移動</b> 矢印キー
        </span>
        {pcPlatform ? (
          <>
            <span>
              <b>通常攻撃</b> {keyboardLabel(keyboardBindings.fire)}
            </span>
            <span>
              <b>チャージ</b> {keyboardLabel(keyboardBindings.charge)}長押し
            </span>
            <span>
              <b>カード</b> {keyboardLabel(keyboardBindings.skill)}
            </span>
          </>
        ) : (
          <span>
            <b>攻撃</b> 画面のボタン
          </span>
        )}
        <span>
          <b>カード選択</b> 20秒
        </span>
      </footer>
      </StartupGate>
    </main>
  );
}
