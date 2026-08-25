import type { Card, ConnectionCode, FolderCardClass } from "../types";

/**
 * Connection codes are data, not UI decoration. Keeping the candidates in one
 * table lets the folder editor and the battle hand use the same rule.
 */
const CARD_CODE_OPTIONS: Record<string, ConnectionCode[]> = {
  rapid: ["A", "B"],
  lance: ["A", "C"],
  seeker: ["B", "C"],
  triplet: ["A", "B"],
  wide: ["B", "D"],
  column: ["C", "D"],
  cross: ["D", "E"],
  fan: ["B", "E"],
  ember: ["A", "F"],
  fireline: ["D", "F"],
  frost: ["B", "E"],
  icewall: ["C", "E"],
  volt: ["C", "D"],
  thunderline: ["D", "E"],
  root: ["A", "E"],
  web: ["E", "F"],
  slash: ["A", "C"],
  sweep: ["A", "C"],
  dashslash: ["B", "C"],
  gridcut: ["C", "D"],
  moonblade: ["A", "C"],
  timer: ["D", "F"],
  watchmine: ["E", "F"],
  turret: ["B", "D"],
  stake: ["C", "E"],
  breakpillar: ["C", "F"],
  block: ["B", "E"],
  toxic: ["E", "F"],
  sanctum: ["A", "E"],
  crack: ["C", "F"],
  rush: ["B", "D"],
  sector: ["C", "D"],
  gravity: ["D", "E"],
  gustwall: ["B", "E"],
  hole: ["C", "F"],
  prism: ["A", "E"],
  phase: ["B", "E"],
  return: ["C", "*"],
  substitute: ["D", "*"],
  magguard: ["E", "*"],
  premonition: ["C", "*"],
  rectify: ["A", "*"],
  repair: ["B", "*"],
  fastsync: ["C", "*"],
  stamp: ["*"],
  reroute: ["D", "*"],
  meteor: ["M"],
  dream: ["M"],
  sanctuary: ["S"],
  overdrive: ["X"],
};

export function getAllowedCodes(card: Card): ConnectionCode[] {
  if (card.isOverload) return ["!"];
  const configured = CARD_CODE_OPTIONS[card.id];
  if (configured) return [...configured];
  if (/^[A-F]$/.test(card.code)) return [card.code as ConnectionCode];
  return ["*"];
}

export function getFolderCardClass(card: Card): FolderCardClass {
  if (card.isOverload) return "overload";
  if (card.id === "overdrive") return "trump";
  if (card.id === "moonblade") return "upper";
  if (card.tier === "mega") return "upper";
  return "standard";
}

export function getCardCodeOptions(): Readonly<Record<string, ConnectionCode[]>> {
  return CARD_CODE_OPTIONS;
}
