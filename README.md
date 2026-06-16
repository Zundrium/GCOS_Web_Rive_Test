# GCOS Web Rive Test

Prototype exploring [Rive](https://rive.app) as an interactive animation display within the GCOS app-server architecture.

## The experiment

**Interactive**: Loads a Rive `.riv` file (the [Glowing Subscribe Button](https://rive.app/marketplace/20749-39045-glowing-subscribe-button/)) on a canvas. Listens for GCOS events and fires Rive triggers in response.

**Operator**: A single switch that emits `/SubscribeToggle` via the GCOS wire protocol.

## Architecture

```
Operator (React/Vite)          Interactive (Vite + Rive)
  Subscribe switch               Canvas + Rive runtime
       │                              │
       └──── GCOS WS (app-server) ────┘
              /SubscribeToggle
              { subscribed: boolean }
```

## Quick start

```bash
node start.mjs
```

This installs dependencies if needed, runs `gcos-build` for the two Vite apps, and starts the app-server on port 8100.

Open:

- operator: `http://localhost:8100/apps/operator/`
- interactive: `http://localhost:8100/apps/interactive/`

Skip install/build if already done:

```bash
node start.mjs --skip-install --skip-build
```

## What happens

1. Toggle the switch in the operator
2. Operator emits `/SubscribeToggle { subscribed: true }` via GCOS
3. App-server retains the state and broadcasts to all connected clients
4. Interactive receives the event and fires `Trigger 1` on the Rive state machine
5. The subscribe button animation plays

## Rive file details

- **Source**: https://rive.app/marketplace/20749-39045-glowing-subscribe-button/
- **File URL**: `https://public.rive.app/community/runtime-files/20749-39045-glowing-subscribe-button.riv`
- **Artboard**: `Artboard`
- **State Machine**: `State Machine 1`
- **Input**: `Trigger 1` (trigger type)

## Adapting to a different .riv file

1. Replace `RIVE_SRC` in `apps/interactive/src/main.ts`
2. Update `ARTBOARD` and `STATE_MACHINE` constants
3. Update the trigger/input name in `fireSubscribeTrigger()`
4. Optionally add more events in `config/events.yaml` for additional inputs
