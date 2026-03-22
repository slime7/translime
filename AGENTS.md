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
6. If the user asks for native bindings, overlay windows, or a more complex build flow, consult `.agents/plugin-scaffold/plugin-variants.md` and borrow selectively from recent packages such as `translime-plugin-steam-save-backup` or `translime-plugin-hdr-capture`.
