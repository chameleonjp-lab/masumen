/** Signal Relay Tactical asset contract: production media is bundled with the application. */
const assetPath = (file: string): string => `./assets/${file}`;

export const ASSET_URLS = {
  reference: assetPath("arena-reference.svg"),
  pilot: assetPath("pilot.svg"),
  pilotAttack: assetPath("pilot-attack.svg"),
  shieldDrone: assetPath("shield-drone.svg"),
  sensorOrb: assetPath("sensor-orb.svg"),
  razorScout: assetPath("razor-scout.svg"),
  mortarNode: assetPath("mortar-node.svg"),
  voltSentinel: assetPath("volt-sentinel.svg"),
  mark: assetPath("relay-mark.svg"),
} as const;
