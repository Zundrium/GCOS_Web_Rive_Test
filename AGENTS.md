# GCOS Web Rive Test

Prototype/template for a GCOS operator + interactive pair driving Rive WebGL2 files through `@gcos/app-server`.

## Standard architecture

- `config/events.yaml` owns the wire contract.
- `gcos-build` generates `@gcos/io`; app code should use `connect`, `on`, and `emit` from `@gcos/io` instead of hand-written WebSocket frames.
- Operator and interactive share project/control metadata from `apps/shared/src/rive-projects.ts`.
- Shared GCOS connection setup lives in `apps/shared/src/gcos-client.ts` and forces the browser client to connect to app-server `/ws` at the current origin.

## App roles

- `apps/operator/src/OperatorPage.tsx` is the React control surface. It selects a Rive project and emits `/RiveProjectSelected` plus `/RiveControlChanged`.
- `apps/interactive/src/main.ts` is the display. It subscribes to the same generated events, loads the selected `.riv`, and applies view-model or state-machine controls.
- Rive files live in `apps/interactive/public/` and are served as `/apps/interactive/<file>.riv`.

## Rive/WebGL2 rules

- Use `@rive-app/webgl2`; this project is meant to test the WebGL2 path.
- Do not call `canvas.getContext('2d')` on the Rive canvas before creating the Rive instance. That can break later WebGL2 context creation.
- Clear the canvas by resetting `canvas.width`.
- Keep `useOffscreenRenderer: true` unless testing a specific runtime issue.
- WebView2 hosts must keep GPU acceleration enabled.

## Change workflow

1. Add or edit events in `config/events.yaml` only when the wire payload changes.
2. Add project metadata and controls in `apps/shared/src/rive-projects.ts`.
3. Keep operator and interactive app code thin; avoid duplicating Rive project lists or GCOS connection code.
4. Run:

```bash
npm run typecheck
npm run build
```

## Run

```bash
node start.mjs
```

Open:

- `http://localhost:8100/apps/operator/`
- `http://localhost:8100/apps/interactive/`
