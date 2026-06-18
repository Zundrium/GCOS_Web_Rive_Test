import { Rive } from '@rive-app/webgl2';
import { on, type X2fRiveControlChangedPayload, type X2fRiveProjectSelectedPayload } from '@gcos/io';
import { connectGcos } from '../../shared/src/gcos-client';
import { findRiveProject, type RiveProject } from '../../shared/src/rive-projects';
import './styles.css';

type RiveControlMessage = X2fRiveControlChangedPayload;

const INTERACTIVE_SOURCE = 'rive-test-interactive';
const canvas = requireElement<HTMLCanvasElement>('#rive-canvas');
const statusEl = requireElement<HTMLDivElement>('#status');

let activeProject: RiveProject | null = null;
let rive: Rive | null = null;
let riveLoaded = false;
let pendingControls: RiveControlMessage[] = [];

statusEl.textContent = 'select a Rive project';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

window.addEventListener('resize', () => rive?.resizeDrawingSurfaceToCanvas());

const unsubscribeProjectSelected = on('/RiveProjectSelected', handleProjectSelected);
const unsubscribeControlChanged = on('/RiveControlChanged', handleControlChanged);
const connection = connectGcos({
  source: INTERACTIVE_SOURCE,
  onStateChange: (state) => {
    if (!activeProject && state !== 'connected') statusEl.textContent = `GCOS ${state}`;
  },
});

window.addEventListener('beforeunload', () => {
  unsubscribeProjectSelected();
  unsubscribeControlChanged();
  connection.stop();
  rive?.cleanup();
});

function handleProjectSelected(payload: X2fRiveProjectSelectedPayload) {
  loadProject(payload.projectId);
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

function clearProject() {
  activeProject = null;
  riveLoaded = false;
  pendingControls = [];
  rive?.cleanup();
  rive = null;
  // Do not call canvas.getContext('2d') here: once a canvas has a 2D
  // context, WebGL2 renderer creation on the same canvas can fail.
  canvas.width = canvas.width;
  statusEl.textContent = 'select a Rive project';
}

function loadProject(projectId: string) {
  if (!projectId) {
    clearProject();
    return;
  }

  const nextProject = findRiveProject(projectId);
  if (!nextProject) {
    console.warn('[rive] Unknown project:', projectId);
    return;
  }

  if (nextProject.id === activeProject?.id && riveLoaded) return;

  rive?.cleanup();
  rive = null;
  riveLoaded = false;
  pendingControls = [];
  activeProject = nextProject;
  statusEl.textContent = `loading ${nextProject.label}...`;

  const projectAtLoadStart = nextProject;
  rive = new Rive({
    ...loadParamsForProject(projectAtLoadStart),
    canvas,
    autoplay: true,
    autoBind: true,
    shouldDisableRiveListeners: true,
    useOffscreenRenderer: true,
    onLoad: () => {
      if (activeProject?.id !== projectAtLoadStart.id) return;
      riveLoaded = true;
      rive?.resizeDrawingSurfaceToCanvas();
      statusEl.textContent = `loaded ${projectAtLoadStart.label}`;
      logRiveContents(projectAtLoadStart);
      fireBootTriggers(projectAtLoadStart);
      flushPendingControls();
    },
    onLoadError: (error) => {
      if (activeProject?.id !== projectAtLoadStart.id) return;
      riveLoaded = false;
      statusEl.textContent = `failed to load ${projectAtLoadStart.label}`;
      console.error('[rive] Load error:', error, 'src:', riveSrc(projectAtLoadStart));
    },
  });
}

function logRiveContents(project: RiveProject) {
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
  if (!rive || !riveLoaded) return false;

  if (payload.source === 'stateMachine') return applyStateMachineInput(payload);
  return applyViewModelControl(payload) || applyStateMachineInput(payload);
}

function applyViewModelControl(payload: RiveControlMessage): boolean {
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
  for (const artboard of rive?.contents?.artboards ?? []) {
    const stateMachine = artboard.stateMachines[0];
    if (stateMachine) return stateMachine.name;
  }
  return null;
}
