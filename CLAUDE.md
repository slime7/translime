# Claude Instructions

Use `.agent/plugin-scaffold/` as the shared plugin bootstrap resource for this repository.

When asked to create a new plugin:

- Enforce the `translime-plugin-` prefix.
- Run `node .agent/plugin-scaffold/create-plugin.mjs --name translime-plugin-your-name` from the repository root.
- Default to `packages/template-translime-plugin`.
- Read `.agent/plugin-scaffold/plugin-variants.md` only when the user explicitly needs a richer UI package, native bindings, overlay windows, or a non-default template.
