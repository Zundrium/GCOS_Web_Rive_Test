import { Rive as CanvasRive } from '@rive-app/canvas';
import { Rive as WebGl1Rive } from '@rive-app/webgl';
import { Rive as WebGl2Rive } from '@rive-app/webgl2';
import {
  emit,
  on,
  type X2fRiveControlChangedPayload,
  type X2fRiveProjectSelectedPayload,
  type X2fRiveRenderQualityChangedPayload,
  type X2fRiveRendererChangedPayload,
} from '@gcos/io';
import { connectGcos } from '../../shared/src/gcos-client';
import {
  RIVE_RENDERER_STORAGE_KEY,
  findRiveProject,
  isRiveRenderer,
  type RiveProject,
  type RiveRenderer,
} from '../../shared/src/rive-projects';
import './styles.css';

type RiveControlMessage = X2fRiveControlChangedPayload;

type RiveInstance = InstanceType<typeof WebGl2Rive> | InstanceType<typeof WebGl1Rive> | InstanceType<typeof CanvasRive>;
type RiveConstructor = typeof WebGl2Rive | typeof WebGl1Rive | typeof CanvasRive;

type RiveSession = {
  id: number;
  project: RiveProject;
  renderer: RiveRenderer;
  instance: RiveInstance | null;
  fpsCounterEnabled: boolean;
  disposed: boolean;
};

const INTERACTIVE_SOURCE = 'rive-test-interactive';
const STATS_EMIT_INTERVAL_MS = 1000;
const MIN_RENDER_SCALE_PERCENT = 25;
const MAX_RENDER_SCALE_PERCENT = 100;

let canvas = requireElement<HTMLCanvasElement>('#rive-canvas');
const statusEl = requireElement<HTMLDivElement>('#status');

let activeProject: RiveProject | null = null;
let riveLoaded = false;
let desiredRenderer: RiveRenderer = 'webgl2';
let currentSession: RiveSession | null = null;
let nextSessionId = 0;
let pendingControls: RiveControlMessage[] = [];
let renderScalePercent = 100;
let latestFps: number | undefined;
let lastStatsEmitAt = 0;

statusEl.textContent = 'select a Rive project';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

window.addEventListener('resize', resizeRiveAndReportStats);
window.addEventListener('storage', handleStorageCommand);

const unsubscribeProjectSelected = on('/RiveProjectSelected', handleProjectSelected);
const unsubscribeControlChanged = on('/RiveControlChanged', handleControlChanged);
const unsubscribeRenderQualityChanged = on('/RiveRenderQualityChanged', handleRenderQualityChanged);
const unsubscribeRendererChanged = on('/RiveRendererChanged', handleRendererChanged);
const connection = connectGcos({
  source: INTERACTIVE_SOURCE,
  onStateChange: (state) => {
    if (!activeProject && state !== 'connected') statusEl.textContent = `GCOS ${state}`;
  },
});

window.addEventListener('beforeunload', () => {
  unsubscribeProjectSelected();
  unsubscribeControlChanged();
  unsubscribeRenderQualityChanged();
  unsubscribeRendererChanged();
  window.removeEventListener('storage', handleStorageCommand);
  connection.stop();
  cleanupCurrentSession('beforeunload');
});

function handleStorageCommand(event: StorageEvent) {
  if (event.key !== RIVE_RENDERER_STORAGE_KEY || !event.newValue) return;

  try {
    const command = JSON.parse(event.newValue) as { renderer?: unknown };
    if (typeof command.renderer !== 'string') return;
    console.log('[rive] Received renderer fallback command:', command.renderer);
    setDesiredRenderer(normalizeRenderer(command.renderer));
  } catch (error) {
    console.warn('[rive] Invalid renderer fallback command:', error);
  }
}

function handleProjectSelected(payload: X2fRiveProjectSelectedPayload) {
  const nextRenderer = payload.renderer ? normalizeRenderer(payload.renderer) : desiredRenderer;
  if (nextRenderer !== desiredRenderer) {
    console.log('[rive] Project selection changed renderer:', desiredRenderer, '->', nextRenderer);
    desiredRenderer = nextRenderer;
  }

  loadProject(payload.projectId);
}

function handleRenderQualityChanged(payload: X2fRiveRenderQualityChangedPayload) {
  const nextScale = clampRenderScalePercent(payload.scalePercent);
  const nextRenderer = payload.renderer ? normalizeRenderer(payload.renderer) : desiredRenderer;
  const rendererChanged = nextRenderer !== desiredRenderer;
  const scaleChanged = nextScale !== renderScalePercent;

  renderScalePercent = nextScale;

  if (rendererChanged) {
    setDesiredRenderer(nextRenderer);
    return;
  }

  if (scaleChanged) {
    resizeRiveAndReportStats();
    return;
  }

  emitRenderStats(true);
}

function handleRendererChanged(payload: X2fRiveRendererChangedPayload) {
  setDesiredRenderer(normalizeRenderer(payload.renderer));
}

function normalizeRenderer(value: string): RiveRenderer {
  return isRiveRenderer(value) ? value : 'webgl2';
}

function setDesiredRenderer(nextRenderer: RiveRenderer) {
  if (nextRenderer === desiredRenderer) {
    emitRenderStats(true);
    return;
  }

  console.log('[rive] Switching renderer:', desiredRenderer, '->', nextRenderer);
  desiredRenderer = nextRenderer;

  if (activeProject) {
    loadProject(activeProject.id, { force: true });
  } else {
    clearProject();
  }
}

function clampRenderScalePercent(value: number): number {
  if (!Number.isFinite(value)) return renderScalePercent;
  return Math.min(MAX_RENDER_SCALE_PERCENT, Math.max(MIN_RENDER_SCALE_PERCENT, Math.round(value)));
}

function resizeRiveAndReportStats() {
  const customDevicePixelRatio = window.devicePixelRatio * (renderScalePercent / 100);
  currentSession?.instance?.resizeDrawingSurfaceToCanvas(customDevicePixelRatio);
  emitRenderStats(true);
}

function emitRenderStats(force = false) {
  const now = performance.now();
  if (!force && now - lastStatsEmitAt < STATS_EMIT_INTERVAL_MS) return;
  lastStatsEmitAt = now;

  void emit('/RiveRenderStats', {
    renderer: currentSession?.renderer ?? desiredRenderer,
    renderWidth: canvas.width,
    renderHeight: canvas.height,
    viewportWidth: Math.round(canvas.clientWidth),
    viewportHeight: Math.round(canvas.clientHeight),
    devicePixelRatio: window.devicePixelRatio,
    scalePercent: renderScalePercent,
    fps: latestFps,
  });
}

function riveSrc(project: RiveProject): string {
  return new URL(project.fileName, `${window.location.origin}/apps/interactive/`).toString();
}

function loadParamsForProject(project: RiveProject) {
  return {
    src: riveSrc(project),
    artboard: project.artboard,
    stateMachines: project.stateMachines,
  };
}

function rendererConstructor(renderer: RiveRenderer): RiveConstructor {
  if (renderer === 'canvas') return CanvasRive;
  if (renderer === 'webgl1') return WebGl1Rive;
  return WebGl2Rive;
}

function clearProject() {
  activeProject = null;
  riveLoaded = false;
  pendingControls = [];
  latestFps = undefined;
  cleanupCurrentSession('clear project');
  replaceCanvasElement();
  statusEl.textContent = 'select a Rive project';
  emitRenderStats(true);
}

function cleanupCurrentSession(reason: string) {
  const session = currentSession;
  currentSession = null;
  riveLoaded = false;
  latestFps = undefined;
  if (session) cleanupSession(session, reason);
}

function cleanupSession(session: RiveSession, reason: string) {
  if (session.disposed) return;
  session.disposed = true;

  const instance = session.instance;
  session.instance = null;
  if (!instance) return;

  if (session.fpsCounterEnabled) {
    try {
      instance.disableFPSCounter();
    } catch (error) {
      console.warn(`[rive] FPS counter cleanup skipped during ${reason}:`, error);
    } finally {
      session.fpsCounterEnabled = false;
    }
  }

  try {
    instance.cleanup();
  } catch (error) {
    console.warn(`[rive] Rive cleanup skipped during ${reason}:`, error);
  }
}

function replaceCanvasElement() {
  // Do not call canvas.getContext('2d') here: once a canvas has a 2D
  // context, WebGL2 renderer creation on the same canvas can fail. Replacing
  // the element also allows switching between WebGL2 and Canvas context modes.
  const nextCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
  canvas.replaceWith(nextCanvas);
  canvas = nextCanvas;
}

function loadProject(projectId: string, options: { force?: boolean } = {}) {
  if (!projectId) {
    clearProject();
    return;
  }

  const nextProject = findRiveProject(projectId);
  if (!nextProject) {
    console.warn('[rive] Unknown project:', projectId);
    return;
  }

  const existingSessionMatches = currentSession
    && currentSession.project.id === nextProject.id
    && currentSession.renderer === desiredRenderer
    && !currentSession.disposed;
  if (!options.force && existingSessionMatches) return;

  cleanupCurrentSession('reload');
  replaceCanvasElement();
  activeProject = nextProject;
  pendingControls = [];
  statusEl.textContent = `loading ${nextProject.label} with ${desiredRenderer}...`;

  const session: RiveSession = {
    id: ++nextSessionId,
    project: nextProject,
    renderer: desiredRenderer,
    instance: null,
    fpsCounterEnabled: false,
    disposed: false,
  };
  currentSession = session;

  const RiveRenderer = rendererConstructor(session.renderer);
  const loadOptions = {
    ...loadParamsForProject(session.project),
    canvas,
    autoplay: true,
    autoBind: true,
    shouldDisableRiveListeners: true,
    ...(session.renderer !== 'canvas' ? { useOffscreenRenderer: true } : {}),
    enablePerfMarks: true,
    onLoad: () => handleRiveLoaded(session),
    onLoadError: (error: unknown) => handleRiveLoadError(session, error),
  };

  try {
    session.instance = new RiveRenderer(loadOptions);
  } catch (error) {
    handleRiveLoadError(session, error);
  }
}

function isCurrentSession(session: RiveSession): boolean {
  return currentSession === session && !session.disposed;
}

function handleRiveLoaded(session: RiveSession) {
  if (!isCurrentSession(session)) {
    cleanupSession(session, 'stale onLoad');
    return;
  }

  riveLoaded = true;

  try {
    session.instance?.enableFPSCounter((fps) => {
      if (!isCurrentSession(session)) return;
      latestFps = fps;
      emitRenderStats();
    });
    session.fpsCounterEnabled = true;
  } catch (error) {
    console.warn('[rive] FPS counter unavailable:', error);
  }

  resizeRiveAndReportStats();
  statusEl.textContent = `loaded ${session.project.label} with ${session.renderer}`;
  logRiveContents(session.project);
  fireBootTriggers(session.project);
  flushPendingControls();
}

function handleRiveLoadError(session: RiveSession, error: unknown) {
  if (!isCurrentSession(session)) {
    cleanupSession(session, 'stale load error');
    return;
  }

  riveLoaded = false;
  statusEl.textContent = `failed to load ${session.project.label} with ${session.renderer}`;
  console.error('[rive] Load error:', error, 'src:', riveSrc(session.project));
  cleanupCurrentSession('load error');
}

function logRiveContents(project: RiveProject) {
  const rive = currentSession?.instance;
  console.log('[rive] Loaded project:', project.id, project.label, riveSrc(project));
  console.log('[rive] Artboards:', rive?.contents?.artboards?.map((a) => a.name));
  rive?.contents?.artboards?.forEach((artboard) => {
    artboard.stateMachines.forEach((stateMachine) => {
      console.log(`[rive] State machine "${stateMachine.name}" inputs:`, stateMachine.inputs);
    });
  });
}

function handleControlChanged(payload: RiveControlMessage) {
  if (payload.projectId !== activeProject?.id) {
    loadProject(payload.projectId);
  }

  if (!riveLoaded) {
    pendingControls.push(payload);
    return;
  }

  const handled = applyControl(payload);
  if (!handled) console.warn('[rive] Control not handled:', payload);
}

function fireBootTriggers(project: RiveProject) {
  for (const triggerName of project.bootTriggers ?? []) {
    const handled = applyControl({
      projectId: project.id,
      projectLabel: project.label,
      controlName: triggerName,
      controlType: 'trigger',
      source: 'viewModel',
    });
    if (!handled) console.warn('[rive] Boot trigger not handled:', triggerName);
  }
}

function flushPendingControls() {
  const controls = pendingControls;
  pendingControls = [];
  for (const control of controls) {
    const handled = applyControl(control);
    if (!handled) console.warn('[rive] Pending control not handled:', control);
  }
}

function applyControl(payload: RiveControlMessage): boolean {
  if (!currentSession?.instance || !riveLoaded) return false;

  if (payload.source === 'stateMachine') return applyStateMachineInput(payload);
  return applyViewModelControl(payload) || applyStateMachineInput(payload);
}

function applyViewModelControl(payload: RiveControlMessage): boolean {
  const rive = currentSession?.instance;
  if (!rive) return false;
  const instance = rive.viewModelInstance;
  if (!instance) return false;

  const paths = controlPathCandidates(payload.controlName);

  try {
    if (payload.controlType === 'trigger') {
      let fired = false;
      for (const path of paths) {
        const trigger = instance.trigger(path);
        if (!trigger) continue;
        trigger.trigger();
        console.log('[rive] Fired data-binding trigger:', path);
        fired = true;
      }
      return fired;
    }

    if (payload.controlType === 'boolean' && typeof payload.valueBoolean === 'boolean') {
      for (const path of paths) {
        const property = instance.boolean(path);
        if (!property) continue;
        property.value = payload.valueBoolean;
        console.log('[rive] Set data-binding boolean:', path, payload.valueBoolean);
        return true;
      }
    }

    if (payload.controlType === 'number' && typeof payload.valueNumber === 'number') {
      for (const path of paths) {
        const property = instance.number(path);
        if (!property) continue;
        property.value = payload.valueNumber;
        console.log('[rive] Set data-binding number:', path, payload.valueNumber);
        return true;
      }
    }

    if (payload.controlType === 'enumType' && typeof payload.valueString === 'string') {
      for (const path of paths) {
        const property = instance.enum(path);
        if (!property) continue;
        property.value = payload.valueString;
        console.log('[rive] Set data-binding enum:', path, payload.valueString);
        return true;
      }
    }
  } catch (error) {
    console.warn('[rive] Data-binding control failed:', payload.controlName, error);
  }

  return false;
}

function controlPathCandidates(controlName: string): string[] {
  const paths = [controlName];
  for (const prefix of activeProject?.nestedViewModelPaths ?? []) {
    paths.push(`${prefix}/${controlName}`);
  }
  return paths;
}

function applyStateMachineInput(payload: RiveControlMessage): boolean {
  const rive = currentSession?.instance;
  if (!rive) return false;
  const stateMachine = payload.stateMachine ?? firstStateMachineName();
  if (!stateMachine) return false;

  const input = rive.stateMachineInputs(stateMachine).find((item) => item.name === payload.controlName);
  if (!input) return false;

  if (payload.controlType === 'trigger') {
    input.fire();
    console.log('[rive] Fired state-machine trigger:', payload.controlName);
    return true;
  }

  if (payload.controlType === 'boolean' && typeof payload.valueBoolean === 'boolean') {
    input.value = payload.valueBoolean;
    console.log('[rive] Set state-machine boolean:', payload.controlName, payload.valueBoolean);
    return true;
  }

  if (payload.controlType === 'number' && typeof payload.valueNumber === 'number') {
    input.value = payload.valueNumber;
    console.log('[rive] Set state-machine number:', payload.controlName, payload.valueNumber);
    return true;
  }

  return false;
}

function firstStateMachineName(): string | null {
  const rive = currentSession?.instance;
  for (const artboard of rive?.contents?.artboards ?? []) {
    const stateMachine = artboard.stateMachines[0];
    if (stateMachine) return stateMachine.name;
  }
  return null;
}
