# Chromium SVG texture intrinsic-size correction

Dependent on PR71 head 0fea7bb4853dddb2f163e90fb1b700f513d5e67a; this is a separate branch/PR, not a change to PR71. The local baseline tree matches all 247 remote blobs exactly.

Production scope: only pilot.svg and pilot-attack.svg, used by scene.ts spriteMaterial -> new Texture. Both receive width="128" height="128" matching their existing viewBox. Paths, colors, filters, viewBox, plane geometry, game rules, score/identity and publication settings do not change. DOM-only relay-mark/arena-reference and unused SVG assets are not edited. Original artwork bytes are retained as regression fixtures.

Evidence: isolated diagnostic head 1d150eb9c5bb2dbc0df421ccb08e48784ef5dabe / run41431482446. Chromium WebGL1/2 with original dimensionless pilot produced upload error1281 and black16384/color0; intrinsic128 and explicitCanvas controls in both engines produced error0, transparent9572/color4404. Original WebKit succeeded. No game/RPC/external request; same standard Playwright container and GPU options. The PNG evidence was visually inspected.

Regression: exact artwork equality except two size attributes; per-engine/version original vs fixed 2D RGBA SHA equality; fixed SVG and Canvas GPU upload must have error0, complete framebuffer and transparent/color pixels. Missing GPU is failure, not success. Original SVG remains an observational control. Both actual-game engine screenshots and existing share/game suite remain required in CI. Source fixtures never become production assets.

No new GPU flags, no relaxed guards, no cleanup/delete. Diagnostic output uses run ID/attempt and per-asset folders. Existing Pages workflow and deployment triggers are untouched. Final browser regression and game screenshots are pending CI; no real-device claim.
