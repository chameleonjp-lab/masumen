# Browser verification: 2026-10-31

These checks used the local Vite build and Playwright 1.62.1 Chromium and WebKit, with every Supabase request intercepted. They created no production ranking records. WebKit desktop automation and resized/touch-enabled viewports are not an iPhone Safari device test.

## Reproduce

Start the app with `npm run dev -- --port 4175`. With Playwright 1.62.1 and its Chromium/WebKit browsers available, run:

```sh
PLAYWRIGHT_PACKAGE=/path/to/playwright node scripts/check-localization-browser.cjs
PLAYWRIGHT_PACKAGE=/path/to/playwright node scripts/check-result-flow-browser.cjs
```

The package override is optional when `playwright` is installed locally. `MASUMEN_TEST_URL` overrides `http://localhost:4175/masumen/`; `MASUMEN_TEST_ARTIFACTS` selects the localization screenshot directory. This workspace used the shared browser cache and extracted Linux dependencies; no project dependency or lockfile was changed for the optional browser checks.

## Results

Both engines passed the following checks:

- All 15 languages: saved home language, localized home/share text, card choices, current-result view and 30 ranking rows.
- Switching language retains the same hand, selected card, current result and submission identity; it adds no score RPC calls. Guest start requires no ranking request.
- Names remain literal text, including Japanese and HTML-like characters. Sharing excludes the player name and uses the current score and canonical game URL. Ranking status remains visible after opening the X composer.
- Controls remain reachable at 393 × 852, 393 × 600 and 852 × 393 with touch enabled.
- Genuine named play: choose a card, begin combat and reach a normal game-over without altering the game engine. In the seeded run, the result was score 0, reached wave 1, elapsed about 17.95 seconds. A simulated lost finish response left the actual result snapshot available after reload. Opening that saved result retried the identical finish ID/name/version/score payload. The observed calls were one start and two identical finish attempts.

The catalog contract contains 700 fixed source strings plus 10 supplementary strings per language, including all card/enemy descriptions, rules, controls and error paths. Automated checks verify complete entries, placeholders and numerical values. The existing combat catalog and internal rule identifiers are unchanged.

The localized FolderEditor and Tutorial components are currently outside the public game flow. The public home has a compact localized how-to panel; this work does not expose practice/folder features. Those unused components were covered by type/build checks, not claimed as reachable browser screens.

## Limits

Native-speaker review of all translations, listening to the actual effects, physical iPhone 17 Pro Safari testing and post-merge production deployment were not performed. The mock server verifies client request behavior, not production RPC execution. Existing database identity based on display names remains a separate limitation documented in the common-spec record.

On iPhone after merge: open the canonical page, choose a language, enter or erase a name using Japanese IME, start a guest game, inspect the how-to and volume controls, rotate the device, finish a game, scroll the ranking, open/cancel X sharing and verify the result and mute/volume setting remain. Test named submission only with an intentional real play after the required backend/settings checks.
