# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A World of Warcraft (retail, Interface 120001) addon called **Smile Tools**. The addon itself is plain Lua; the repo root *is* the addon folder. `package.json` / `tools/` exist only for the local dev sync helper — they are not shipped (see `pkgmeta.yaml` `ignore:` list, which the BigWigs packager honors).

## Dev workflow

```bash
npm install                # one-time, installs chokidar + ignore for the sync tool
npm run sync               # watch mode: copies repo → <WoW>/Interface/AddOns/SmileTools on change
npm run sync:clean         # wipe destination folder, do a single full copy, exit
```

`tools/wow-sync.mjs` auto-detects the retail AddOns folder on Windows by scanning common install roots. Override with `--wowAddonsDir <path>`, `WOW_ADDONS_DIR` env var, or `--wowDir <path> --flavor _retail_`. The target folder name is derived from the `.toc` filename (`SmileTools.toc` → `SmileTools/`). Sync exclusions live under `wowSync.exclude` in [package.json](package.json) — they are separate from `.gitignore` and from `pkgmeta.yaml`'s `ignore:` list.

After changing Lua, the addon must be reloaded in-game (`/reload`) for changes to take effect.

## Addon architecture

**Namespace + module loader.** [Core.lua](Core.lua) defines the shared addon table `ST` (received via `local ADDON_NAME, ST = ...`) and a tiny module registry:

- Every other Lua file receives the same `ST` table via `local _, ST = ...` and either attaches functions to it (e.g. `ST.LogInfo` in [Log.lua](Log.lua), `ST:InitSettings` in [Settings.lua](Settings.lua)) or registers a feature module via `ST:RegisterModule(name, initFunc)`.
- On `ADDON_LOADED`, Core ensures `SmileToolsDB` exists, calls `ST:InitSettings()`, then invokes every registered module's init function. Module init is where you create frames and register game events — do **not** create frames at file top-level if the module depends on saved variables.
- Load order is controlled by [SmileTools.toc](SmileTools.toc). **When adding a new `.lua` file you must add it to the `.toc`**; the sync tool does not do this for you. Order matters: `Core.lua` must load first so `ST` exists; `Log.lua` / `Settings.lua` should load before feature modules that use them.

**Saved variables.** Single `SmileToolsDB` table (declared in the `.toc`). Feature code reads/writes it directly (see `SmileToolsDB.soulstoneCheck`, `SmileToolsDB.announceChannel`). Settings.lua wires those same keys into the Blizzard Settings panel via `Settings.RegisterAddOnSetting(..., SmileToolsDB, ...)`, so the checkbox/dropdown and the runtime state stay in sync automatically.

**Slash command.** `/st` opens the settings panel; `/st debug` toggles `ST.debugMode` (persisted to `SmileToolsDB.debugMode`), which gates `ST.LogDebug` output.

**Settings UI.** Uses the retail `Settings.*` API (not the legacy `InterfaceOptions_*`). `Settings.CreateDropdown` / `Settings.CreateCheckbox` etc. expect a category registered via `Settings.RegisterVerticalLayoutCategory`. Conditional enabling of a control is done with `initializer:AddModifyPredicate(fn)` (see the announce-channel dropdown, disabled when the feature's checkbox is off).

**Feature module convention** (see [SoulstoneCheck.lua](SoulstoneCheck.lua) as the canonical example): pure helper functions at file scope, then one `ST:RegisterModule("Name", function() ... end)` at the bottom that creates a frame and registers the game events the module cares about. Keep a check-the-DB-flag early-return at the top of the event handler so the user's setting actually disables the feature.

## Conventions worth preserving

- Player-facing chat output goes through `ST.LogInfo` / `ST.LogDebug` (both in [Log.lua](Log.lua)) so every message carries the `|cffffcc00Smile Tools:|r` prefix — don't call `print` directly.
- Raid-broadcast messages go through `SendChatMessage`, and the channel must be resolved via logic like `GetAnnounceChannel()` in [SoulstoneCheck.lua](SoulstoneCheck.lua:38) which downgrades `RAID_WARNING` → `PARTY` outside raids and suppresses `RAID_WARNING` when the player lacks lead/assist. Copy that pattern for any new announcement feature.
