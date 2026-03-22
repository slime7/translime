# Plugin Variants

Use this reference only when the user asks for more than the standard template.

## Default Template

Source: `packages/template-translime-plugin`

Use for:

- Standard backend logic in `index.js`
- Embedded plugin UI in `ui.vue`
- Basic Vite and eslint setup
- Fastest scaffold path

Core files:

- `package.json`
- `vite.config.js`
- `ui.vite.config.mjs`
- `eslint.config.mjs`
- `index.js`
- `ui.vue`
- `public/ui/index.html`

## Rich UI Plugin Reference

Source: `packages/translime-plugin-steam-save-backup`

Use for:

- A real plugin package that already follows the current repository build flow
- More realistic file layout under `src/`
- Additional utility modules and a fuller UI implementation

Borrow selectively:

- `src/index.js`
- `src/ui/ui.vue`
- extra utility modules
- script naming conventions in `package.json`

## Native Or Overlay Reference

Source: `packages/translime-plugin-hdr-capture`

Use for:

- Native bindings
- Additional Vite entries
- Overlay window UI
- Multi-step build orchestration

Borrow selectively:

- `overlay.vite.config.mjs`
- native build scripts in `package.json`
- `build.rs`, `Cargo.toml`, `native/`
- overlay files under `src/ui/overlay/`

## Rules

- Do not start from the advanced packages unless the user explicitly needs those capabilities.
- Keep the initial scaffold small; add complexity only after the base package exists and builds.
- When borrowing from a recent package, preserve its existing build flow instead of partially rewriting it.
