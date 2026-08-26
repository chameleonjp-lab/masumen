/** Signal Relay Tactical component: the React frame supplies a clipped industrial HUD while Babylon owns the live arena. */
import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { ASSET_URLS } from "@/game/assets";
import { validateSelection } from "@/game/deck";
import { cardPreviewTiles } from "@/game/data/cardCombatData";
import { createGameScene } from "@/game/scene";
import type { BattleSnapshot, GameHandle } from "@/game/types";
import FolderEditor from "@/components/game/FolderEditor";
import ResultScreen from "@/components/game/ResultScreen";
import Tutorial from "@/components/game/Tutorial";

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
  message: "INITIALIZING TERMINAL",
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

function enemyReadoutLabel(
  enemy: BattleSnapshot["enemies"][number]
): string {
  if (enemy.counterWindow) return "完全同期カウンター受付";
  if (enemy.actionPhase === "counter-window") return "カウンター受付中";
  if (enemy.actionPhase === "startup") return enemy.actionName ?? "攻撃準備";
  if (enemy.actionPhase === "active") return enemy.actionName ?? "攻撃中";
  if (enemy.actionPhase === "recovery") return "攻撃後の隙";
  if (enemy.actionPhase === "stunned") return "麻痺";
  if (enemy.state === "deleted") return "停止";
  return enemy.actionName ?? enemy.pattern.replace("-", " ").toUpperCase();
}

function previewTargets(
  card: BattleSnapshot["customHand"][number] | undefined,
  playerGrid: BattleSnapshot["playerGrid"],
  enemies: BattleSnapshot["enemies"]
) {
  return new Set(
    cardPreviewTiles(
      card,
      playerGrid,
      enemies.map(enemy => enemy.grid)
    ).map(tile => String(tile.col) + ":" + String(tile.row))
  );
}

function previewDelay(
  card: BattleSnapshot["customHand"][number] | undefined,
  col: number,
  row: number,
  playerGrid: BattleSnapshot["playerGrid"]
) {
  if (!card) return 0;
  const action = card.actionId ?? card.id;
  if (action === "rapid" || action === "triplet") return Math.max(0, col - playerGrid.col) * 90;
  if (action === "fan") return Math.max(0, col - playerGrid.col) * 120 + Math.abs(row - playerGrid.row) * 40;
  if (action === "column" || action === "thunderline" || action === "sweep") return row * 110;
  if (action === "cross" || action === "gridcut") return (Math.abs(col - 4) + Math.abs(row - playerGrid.row)) * 100;
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

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const controllerRef = useRef<GameHandle["controller"] | null>(null);
  const [snapshot, setSnapshot] = useState<BattleSnapshot>(initialSnapshot);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(70);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [folderEditorOpen, setFolderEditorOpen] = useState(false);

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
        if (!disposed) setSnapshot(nextSnapshot);
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
    });
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      handle?.dispose();
      engine.dispose();
      controllerRef.current = null;
      startedRef.current = false;
    };
  }, []);

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

  return (
    <main
      className={`game-shell ${crisisState !== "normal" ? `is-${crisisState}` : ""}`}
    >
      <canvas
        ref={canvasRef}
        className="game-canvas"
        style={{ touchAction: "none" }}
        aria-label="Grid Signal Arenaの戦闘フィールド"
      />
      <div className="screen-noise" aria-hidden="true" />
      <div className="crisis-frame" aria-hidden="true" />
      <div className="signal-hud">
        <header className="terminal-brand">
          <img src={ASSET_URLS.mark} alt="Grid Signal Arena" />
          <div>
            <p>GRID SIGNAL</p>
            <strong>ARENA</strong>
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
          <p className="eyebrow">01 / PILOT STATUS // WAVE 0{snapshot.wave}</p>
          <div className="metric-row">
            <span>INTEGRITY</span>
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
                ? "CRITICAL // EVASIVE ACTION"
                : "CAUTION // INTEGRITY LOW"}
            </div>
          )}
          <div className="metric-row compact">
            <span>POSITION</span>
            <strong>
              {snapshot.playerGrid.col + 1} · {snapshot.playerGrid.row + 1}
            </strong>
          </div>
          <div className={`sync-status ${snapshot.sync ? "is-synced" : ""}`}>
            <i />{" "}
            {snapshot.sync
              ? "FULL SYNC // 次カード x2"
              : snapshot.invincible
                ? `PHASE VEIL // ${snapshot.invincibleRemaining.toFixed(1)}S`
                : snapshot.barrier > 0
                  ? `BARRIER // ${snapshot.barrier}`
                  : "SYNC LINK // STANDBY"}
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
          <p className="eyebrow">06 / THREAT SCAN</p>
          {snapshot.enemies.map(enemy => (
            <div className="enemy-readout" key={enemy.id}>
              <div>
                <span className={`enemy-state state-${enemy.state}`} />{" "}
                <b>{enemy.name}</b>
              </div>
              <small>{enemyReadoutLabel(enemy)}</small>
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
          <p className="eyebrow">RUN RECORD</p>
          <div>
            <span>SCORE</span>
            <strong>{String(snapshot.score).padStart(5, "0")}</strong>
          </div>
          <small>
            BEST {String(snapshot.highScore).padStart(5, "0")} / WAVE{" "}
            {String(snapshot.bestWave).padStart(2, "0")}
          </small>
        </section>

        {snapshot.mode === "battle" && (
          <>
            <section className="queue-console technical-panel">
              <p className="eyebrow">NEXT CARD</p>
              {snapshot.queue.length > 0 ? (
                <>
                  <strong>{snapshot.queue[0].name}</strong>
                  <span>
                    {snapshot.sync || snapshot.emotion === "enraged"
                      ? snapshot.queue[0].power * 2
                      : snapshot.queue[0].power}{" "}
                    OUT
                  </span>
                </>
              ) : (
                <strong className="empty-queue">送信済みカードなし</strong>
              )}
            </section>
            <section className="gauge-console technical-panel">
              <div className="metric-row">
                <span>CUSTOM IN</span>
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
              RELAY CONSOLE / WAVE 0{snapshot.wave} /{" "}
              {snapshot.elapsed > 0 ? "10S RE-ROUTE" : "FIRST ROUTE"}
            </span>
            <span>
              手札 {String(snapshot.customHand.length).padStart(2, "0")} / 05
            </span>
          </div>
          <div className="custom-heading">
            <p>SELECT CARDS</p>
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
                  <em>もう一度タップして選択</em>
                </>
              ) : (
                <span>カードを1回タップすると説明を表示します。</span>
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
                  aria-disabled={!canJoin}
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
                RANGE MAP /{" "}
                {snapshot.customHand[
                  snapshot.focusedCard ?? snapshot.selected[0] ?? 0
                ]?.target ?? "front"}
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
                const target = previewTargets(previewCard, snapshot.playerGrid, snapshot.enemies).has(tileKey);
                const player = tileKey === "1:1";
                return (
                  <span
                    className={`range-tile ${col <= 2 ? "ally" : "enemy"} ${target ? "target animated-target" : ""} ${player ? "player" : ""}`}
                    style={
                      target
                        ? {
                            animationDelay: `${previewDelay(previewCard, col, row, snapshot.playerGrid)}ms`,
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
              現在位置の P
              から、説明中または選択中のカードが作用する対象マスを順に走査
            </small>
          </section>
          <div className="custom-footer">
            <p>
              <span>{snapshot.selected.length}</span> / 05 CARDS ROUTED
              {snapshot.selectionError && (
                <small>{snapshot.selectionError}</small>
              )}
            </p>
            <div className="custom-footer-actions">
              <button type="button" onClick={() => setFolderEditorOpen(true)}>
                フォルダ編集
              </button>
              <button
                type="button"
                onClick={() => controller?.startPractice()}
              >
                練習モード
              </button>
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
              onPointerDown={event => {
                event.preventDefault();
                controller?.move(0, 1);
              }}
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="左へ移動"
              onPointerDown={event => {
                event.preventDefault();
                controller?.move(-1, 0);
              }}
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="右へ移動"
              onPointerDown={event => {
                event.preventDefault();
                controller?.move(1, 0);
              }}
            >
              ▶
            </button>
            <button
              type="button"
              aria-label="下へ移動"
              onPointerDown={event => {
                event.preventDefault();
                controller?.move(0, -1);
              }}
            >
              ▼
            </button>
          </div>
          <div className="action-buttons">
            <button
              type="button"
              className="action-fire"
              onPointerDown={event => {
                event.preventDefault();
                controller?.fire();
              }}
              aria-label="通常攻撃"
            >
              FIRE
            </button>
            <button
              type="button"
              className="action-charge"
              onPointerDown={event => {
                event.preventDefault();
                controller?.startCharge();
              }}
              onPointerUp={() => controller?.releaseCharge()}
              onPointerCancel={() => controller?.releaseCharge()}
              aria-label="チャージショット"
            >
              CHG
            </button>
            <button
              type="button"
              className="action-skill"
              onPointerDown={event => {
                event.preventDefault();
                controller?.useSkill();
              }}
              aria-label="次のカードを使用"
            >
              CARD
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
          <p className="eyebrow">COMBAT PAUSED / SETTINGS</p>
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
              SFX {soundEnabled ? "ON" : "OFF"}
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
            RESUME <span>↗</span>
          </button>
        </section>
      )}

      {snapshot.mode === "intermission" && (
        <section className="result-console wave-clear" aria-live="polite">
          <p className="eyebrow">Wave 0{snapshot.wave} / クリア</p>
          <h2>
            次のWaveへ
            <br />
            進みます
          </h2>
          <div className="wave-reward">
            <span>耐久回復</span>
            <strong>+{snapshot.lastWaveRecovery ?? 0}</strong>
            <small>Wave 0{snapshot.wave + 1} 準備完了</small>
          </div>
          <div className="result-details">
            <span>
              Wave獲得 <b>+{snapshot.lastWaveScore?.total ?? 0}</b>
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
            次のWaveへ <span>↗</span>
          </button>
        </section>
      )}

      {snapshot.mode === "result" && (
        <ResultScreen
          snapshot={snapshot}
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
          <b>MOVE</b> WASD / ARROWS
        </span>
        <span>
          <b>FIRE</b> Z / 正面直線
        </span>
        <span>
          <b>CHARGE</b> HOLD SPACE + MOVE
        </span>
        <span>
          <b>CARD</b> X
        </span>
        <span>
          <b>CUSTOM</b> 10 SEC
        </span>
      </footer>
    </main>
  );
}
