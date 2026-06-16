import { Rive } from '@rive-app/webgl2';
import './styles.css';

const RIVE_SRC = 'https://public.rive.app/community/runtime-files/20749-39045-glowing-subscribe-button.riv';
const ARTBOARD = 'Artboard';
const STATE_MACHINE = 'State Machine 1';
const TRIGGER = 'Trigger 1';
const ANIMATION_COOLDOWN_MS = 900;

const canvas = requireElement<HTMLCanvasElement>('#rive-canvas');
const statusEl = requireElement<HTMLDivElement>('#status');

let subscribed = false;
let animatedSubscribed = false;
let riveLoaded = false;
let animationTimer: number | null = null;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const rive = new Rive({
  src: RIVE_SRC,
  canvas,
  artboard: ARTBOARD,
  stateMachines: STATE_MACHINE,
  autoplay: true,
  autoBind: true,
  shouldDisableRiveListeners: true,
  onLoad: () => {
    riveLoaded = true;
    rive.resizeDrawingSurfaceToCanvas();
    console.log('[rive] Loaded:', RIVE_SRC);
    console.log('[rive] Artboards:', rive.contents?.artboards?.map((a) => a.name));
    rive.contents?.artboards?.forEach((artboard) => {
      artboard.stateMachines.forEach((stateMachine) => {
        console.log(`[rive] State machine "${stateMachine.name}" inputs:`, stateMachine.inputs);
      });
    });

    requestSubscribeAnimation();
  },
  onLoadError: (error) => {
    console.error('[rive] Load error:', error);
  },
});

window.addEventListener('resize', () => rive.resizeDrawingSurfaceToCanvas());
connectToAppServer();

function resolveAppServerWsUrl(): string {
  if (import.meta.env.VITE_APP_SERVER_WS_URL) return import.meta.env.VITE_APP_SERVER_WS_URL;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:${window.location.port || '8100'}/ws`;
}

function connectToAppServer() {
  const ws = new WebSocket(resolveAppServerWsUrl());

  ws.onopen = () => {
    ws.send(JSON.stringify({
      frame: 'hello',
      source: 'rive-test-interactive',
      ts: new Date().toISOString(),
    }));
  };

  ws.onmessage = (event: MessageEvent) => {
    const frame = parseFrame(event.data);
    if (!frame) return;

    if (frame.frame === 'ping') {
      ws.send(JSON.stringify({ frame: 'pong', ts: new Date().toISOString() }));
      return;
    }

    if (frame.frame !== 'message') return;

    if (typeof frame.messageId === 'string') {
      ws.send(JSON.stringify({
        frame: 'ack',
        messageId: frame.messageId,
        ts: new Date().toISOString(),
      }));
    }

    if (frame.type !== '/SubscribeToggle') return;

    const nextSubscribed = frame.payload?.subscribed;
    if (typeof nextSubscribed !== 'boolean') return;

    const changed = subscribed !== nextSubscribed;
    subscribed = nextSubscribed;
    statusEl.textContent = subscribed ? 'subscribed ✓' : 'not subscribed';
    if (changed) requestSubscribeAnimation();
  };

  ws.onclose = () => {
    window.setTimeout(connectToAppServer, 5000);
  };

  ws.onerror = () => {
    // Close/reconnect handles app-server startup races.
  };
}

type GcosFrame = {
  frame?: string;
  messageId?: string;
  type?: string;
  payload?: {
    subscribed?: unknown;
  };
};

function parseFrame(data: unknown): GcosFrame | null {
  if (typeof data !== 'string') return null;

  try {
    const frame = JSON.parse(data) as GcosFrame;
    return typeof frame === 'object' && frame !== null ? frame : null;
  } catch {
    return null;
  }
}

function requestSubscribeAnimation() {
  if (!riveLoaded || animationTimer !== null || subscribed === animatedSubscribed) return;

  if (!fireSubscribeTrigger()) return;

  animatedSubscribed = subscribed;
  animationTimer = window.setTimeout(() => {
    animationTimer = null;
    requestSubscribeAnimation();
  }, ANIMATION_COOLDOWN_MS);
}

function fireSubscribeTrigger(): boolean {
  if (fireDataBindingTrigger()) return true;
  return fireStateMachineInputTrigger();
}

function fireDataBindingTrigger(): boolean {
  try {
    const trigger = rive.viewModelInstance?.trigger(TRIGGER);
    if (!trigger) return false;

    trigger.trigger();
    console.log(`[rive] Fired ${TRIGGER} via data binding`);
    return true;
  } catch {
    return false;
  }
}

function fireStateMachineInputTrigger(): boolean {
  const trigger = rive
    .stateMachineInputs(STATE_MACHINE)
    .find((input) => input.name === TRIGGER);

  if (trigger) {
    trigger.fire();
    console.log(`[rive] Fired ${TRIGGER} via stateMachineInputs`);
    return true;
  }

  console.warn(`[rive] ${TRIGGER} not found`);
  return false;
}
