# Agent Instructions

When creating a new plugin package in this repository:

1. Require the package name to start with `translime-plugin-`.
2. Use the shared scaffold in `.agents/plugin-scaffold/`.
3. From the repository root, run:

```powershell
node .agents/plugin-scaffold/create-plugin.mjs --name translime-plugin-your-name
```

4. Default to `packages/template-translime-plugin`.
5. After scaffolding, verify that template placeholders were replaced and run a package build when the environment permits.
6. For a first usable release, default the package version to `1.0.0` unless the user explicitly asks to continue an existing version line.
7. If the plugin includes a web UI, add a usable preview/debug path early. At minimum, make `preview:ui` render meaningful mock data and interactive states instead of empty IPC stubs.
8. If the plugin has non-trivial logic, split functional modules into separately testable files and add a package-level test script.
9. If the user asks for native bindings, overlay windows, or a more complex build flow, consult `.agents/plugin-scaffold/plugin-variants.md` and borrow selectively from recent packages such as `translime-plugin-steam-save-backup` or `translime-plugin-hdr-capture`.
