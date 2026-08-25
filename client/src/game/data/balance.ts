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
  },
  projectile: {
    defaultLifetimeMs: 1800,
    defaultSpeedCellsPerSecond: 12,
    thrownFlightMs: 260,
  },
} as const;
