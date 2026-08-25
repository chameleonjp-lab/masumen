/** Values used by the shared attack layer. Card-specific tuning can move here without changing collision rules. */
export const COMBAT_BALANCE = {
  normalShot: {
    damage: 12,
    intervalByDistanceMs: {
      one: 210,
      two: 260,
      far: 320,
    },
    speedCellsPerSecond: 14,
  },
  chargeShot: {
    damage: 42,
    shortDamage: 12,
    fullChargeMs: 850,
    speedCellsPerSecond: 16,
  },
  playerHit: {
    controlLockMs: 180,
    invulnerableMs: 350,
  },
  phase: {
    invincibilityMs: 5000,
  },
  counter: {
    stunMs: 900,
    windowMs: 150,
    endMarginMs: 20,
    patternWindowMs: {
      "lane-sweep": 150,
      "column-scan": 150,
      "pursuit-dash": 110,
      "mortar-spread": 180,
      "pulse-grid": 140,
    },
  },
  custom: {
    intervalMs: 10000,
    max: 100,
    baseMultiplier: 1,
    fastSyncMultiplier: 2,
    fastSyncDurationMs: 8000,
    severingBladeMultiplier: 0.8,
  },
  emotion: {
    damageWindowMs: 6000,
    damageCountForShaken: 3,
    shakenDurationMs: 8000,
    lowHpRatio: 0.35,
    rageDamageRatio: 0.2,
    rageStaggerMs: 2000,
  },
  overload: {
    maxCorruption: 3,
    maxHpReduction: 10,
    healReductionPerCorruption: 0.1,
    scorePenalty: 400,
    shakenChance: 0.4,
    limitCannonMaxDamage: 400,
    contaminationDamage: 320,
    forcedRepairDrainPerSecond: 1,
    collapseHandReduction: 1,
    severingBladeDamage: 400,
  },
  projectile: {
    defaultLifetimeMs: 1800,
    defaultSpeedCellsPerSecond: 12,
    thrownFlightMs: 260,
  },
} as const;
