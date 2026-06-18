# GCOS Web Rive Test

Template for a GCOS operator + interactive pair driving Rive WebGL2 animations through `@gcos/app-server`.

## Architecture

```text
Operator (React/Vite)                 Interactive (Vite + @rive-app/webgl2)
  Select project + set controls         Load selected .riv + apply controls
            │                                           │
            └──────────── GCOS app-server /ws ──────────┘
                         retained events
```

Events are declared in `config/events.yaml` and generated into `@gcos/io` by `gcos-build`:

- `/RiveProjectSelected` retains the selected project id/label.
- `/RiveControlChanged` retains the last value per event channel and carries one Rive control update.

Both apps use the generated `@gcos/io` client. Do not hand-roll the framed WebSocket protocol in app code.

## Quick start

```bash
node start.mjs
```

This installs dependencies if needed, runs `gcos-build`, and starts the app-server on port 8101.

Open:

- operator: `http://localhost:8101/apps/operator/`
- interactive: `http://localhost:8101/apps/interactive/`

Skip install/build if already done:

```bash
node start.mjs --skip-install --skip-build
```

## Source layout

- `config/events.yaml` - GCOS wire events.
- `apps/shared/src/rive-projects.ts` - single source of truth for Rive files, artboards, state machines, boot triggers, and exposed controls.
- `apps/shared/src/gcos-client.ts` - shared GCOS connection helper; resolves `/ws` at the app-server origin and retries startup races.
- `apps/operator/src/OperatorPage.tsx` - React operator UI; emits generated GCOS events.
- `apps/interactive/src/main.ts` - Rive WebGL2 display; subscribes to generated GCOS events and applies controls.
- `apps/interactive/public/*.riv` - Rive files served at `/apps/interactive/<file>.riv`.

## WebGL2 notes

The interactive app intentionally uses `@rive-app/webgl2`.

- Do not call `canvas.getContext('2d')` on the Rive canvas before WebGL2 is created.
- Clearing is done by resetting `canvas.width`.
- `useOffscreenRenderer: true` is enabled for the Rive runtime.
- In embedded hosts such as WebView2, GPU acceleration must not be disabled.

## Adding a Rive project

1. Put the `.riv` file in `apps/interactive/public/`.
2. Add one entry to `apps/shared/src/rive-projects.ts` with `fileName`, `artboard`, `stateMachines`, optional `bootTriggers`, optional nested view-model paths, and operator controls.
3. If the wire shape changes, update `config/events.yaml` and rerun `npm run build`.
4. Validate with `npm run typecheck` and `npm run build`.

## Useful commands

```bash
npm run typecheck
npm run build
npm run inspect:rive -- apps/interactive/public/<file>.riv
npm run inspect:rive:json -- apps/interactive/public/<file>.riv
```
