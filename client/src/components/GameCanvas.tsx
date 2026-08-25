/** Signal Relay Tactical component: the React frame supplies a clipped industrial HUD while Babylon owns the live arena. */
import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { ASSET_URLS } from "@/game/assets";
import { createGameScene } from "@/game/scene";
import type { BattleSnapshot, GameHandle } from "@/game/types";

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
  selected: [],
  focusedCard: null,
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

function timecode(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

function previewTargets(
  card: BattleSnapshot["customHand"][number] | undefined
) {
  if (!card) return new Set<string>();
  if (card.target === "self") return new Set(["1:1"]);
  if (card.target === "near") return new Set(["3:0", "3:1", "3:2"]);
  if (card.target === "front" || card.target === "row")
    return new Set(["3:1", "4:1", "5:1"]);
  if (card.target === "column") return new Set(["4:0", "4:1", "4:2"]);
  if (card.target === "cross")
    return new Set(["3:1", "4:1", "5:1", "4:0", "4:2"]);
  return new Set([
    "3:0",
    "3:1",
    "3:2",
    "4:0",
    "4:1",
    "4:2",
    "5:0",
    "5:1",
    "5:2",
  ]);
}

function previewDelay(
  card: BattleSnapshot["customHand"][number] | undefined,
  col: number,
  row: number
) {
  if (!card || card.target === "self") return 0;
  if (card.target === "front" || card.target === "row") return (col - 3) * 135;
  if (card.target === "column" || card.target === "near") return row * 135;
  if (card.target === "cross")
    return (Math.abs(col - 4) + Math.abs(row - 1)) * 120;
  return (col - 3) * 140 + row * 42;
}

function previewVector(card: BattleSnapshot["customHand"][number] | undefined) {
  if (!card) return "→";
  if (card.target === "self") return "◎";
  if (card.target === "near") return "↦";
  if (card.target === "column") return "↕";
  if (card.target === "cross") return "✣";
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
        </section>

        <section className="enemy-console technical-panel">
          <p className="eyebrow">06 / THREAT SCAN</p>
          {snapshot.enemies.map(enemy => (
            <div className="enemy-readout" key={enemy.id}>
              <div>
                <span className={`enemy-state state-${enemy.state}`} />{" "}
                <b>{enemy.name}</b>
              </div>
              <small>
                {enemy.state === "windup"
                  ? "VECTOR LOCK"
                  : enemy.state === "stunned"
                    ? "STUNNED"
                    : enemy.state === "deleted"
                      ? "OFFLINE"
                      : enemy.pattern.replace("-", " ").toUpperCase()}
              </small>
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
                    {snapshot.sync
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
              <button type="button" onClick={() => controller?.openCustom()}>
                ROUTE C
              </button>
            </section>
            <section className="skill-rail" aria-label="送信済みカード">
              {snapshot.queue.map((card, index) => (
                <div
                  className={`queued-card ${index === 0 ? "next" : ""} ${card.tier === "mega" ? "mega" : ""}`}
                  key={`${card.id}-${index}`}
                >
                  <em>
                    {index + 1} / {card.tier === "mega" ? "メガ" : card.family}
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
            <span>HAND 05</span>
          </div>
          <div className="custom-heading">
            <p>SELECT CARDS</p>
            <h1>
              次の一手を、
              <br />
              接続する。
            </h1>
            <span>
              カードは組み合わせを問わず、最大5枚まで自由に送信できます。
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
              const selectionOrder = snapshot.selected.indexOf(index) + 1;
              return (
                <button
                  type="button"
                  key={`${card.id}-${index}`}
                  className={`signal-card ${selected ? "selected" : ""} ${focused ? "focused" : ""} ${card.tier === "mega" ? "mega-card" : ""}`}
                  onClick={() => controller?.toggleCard(index)}
                >
                  <span className="card-index">0{index + 1}</span>
                  {selected && (
                    <span className="selection-order">{selectionOrder}</span>
                  )}
                  <span className="card-lane">
                    {card.tier === "mega" ? "メガ" : card.family}
                  </span>
                  <strong>{card.name}</strong>
                  <small>{card.description}</small>
                  <b>
                    {card.power}
                    <em>OUT</em>
                  </b>
                  <i>{card.tier === "mega" ? "メガ" : card.family}</i>
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
                const target = previewTargets(previewCard).has(tileKey);
                const player = tileKey === "1:1";
                return (
                  <span
                    className={`range-tile ${col <= 2 ? "ally" : "enemy"} ${target ? "target animated-target" : ""} ${player ? "player" : ""}`}
                    style={
                      target
                        ? {
                            animationDelay: `${previewDelay(previewCard, col, row)}ms`,
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
              自陣中央の P
              から、説明中または選択中のカードが作用する対象マスを順に走査
            </small>
          </section>
          <div className="custom-footer">
            <p>
              <span>{snapshot.selected.length}</span> / 05 CARDS ROUTED
            </p>
            <button
              type="button"
              className="engage-button"
              onClick={() => controller?.confirmCustom()}
            >
              ENGAGE <span>↗</span>
            </button>
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
          <p className="eyebrow">WAVE 0{snapshot.wave} / DATA SECURED</p>
          <h2>
            ROUTE
            <br />
            THE NEXT WAVE
          </h2>
          <div className="wave-reward">
            <span>INTEGRITY RESTORED</span>
            <strong>+32</strong>
            <small>WAVE 0{snapshot.wave + 1} INBOUND</small>
          </div>
          <div className="result-details">
            <span>
              RUN SCORE <b>{snapshot.score}</b>
            </span>
            <span>
              COUNTERS <b>{String(snapshot.counters).padStart(2, "0")}</b>
            </span>
          </div>
          <button
            type="button"
            className="engage-button"
            onClick={() => controller?.nextWave()}
          >
            NEXT WAVE <span>↗</span>
          </button>
        </section>
      )}

      {snapshot.mode === "result" && (
        <section className="result-console" aria-live="polite">
          <p className="eyebrow">
            RESULT / {snapshot.rank === "R" ? "RETRY CHANNEL" : "DATA SECURED"}
          </p>
          <h2>{snapshot.rank === "R" ? "SIGNAL LOST" : "NETWORK CLEARED"}</h2>
          <div className="rank-dial">
            <span>RANK</span>
            <strong>{snapshot.rank}</strong>
          </div>
          <div className="result-details">
            <span>
              SCORE <b>{snapshot.score}</b>
            </span>
            <span>
              BEST <b>{snapshot.highScore}</b>
            </span>
            <span>
              WAVE <b>{String(snapshot.bestWave).padStart(2, "0")}</b>
            </span>
          </div>
          <button
            type="button"
            className="engage-button"
            onClick={() => controller?.restart()}
          >
            RELINK <span>↗</span>
          </button>
        </section>
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
