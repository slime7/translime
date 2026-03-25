# Translime Plugin Scaffold

Shared plugin scaffolding resource for repository-local agents.

Use the bundled script from the repository root:

```powershell
node .agents/plugin-scaffold/create-plugin.mjs --name translime-plugin-your-name
```

Optional flags:

- `--title "Plugin Title"`
- `--description "Plugin description"`
- `--template <package-name>`
- `--repo <path>`
- `--force`

Default template: `packages/template-translime-plugin`

Advanced references:

- `packages/translime-plugin-steam-save-backup`
- `packages/translime-plugin-hdr-capture`
