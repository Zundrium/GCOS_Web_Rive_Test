export type RiveControlType = 'trigger' | 'boolean' | 'number' | 'enumType';
export type RiveControlSource = 'viewModel' | 'stateMachine';
export type RiveControlValue = string | number | boolean;
export type RiveRenderer = 'webgl2' | 'webgl1' | 'canvas';

export const riveRenderers: Array<{ label: string; value: RiveRenderer; description: string }> = [
  { label: 'WebGL2', value: 'webgl2', description: 'GPU/WebGL2 renderer' },
  { label: 'WebGL1', value: 'webgl1', description: 'GPU/WebGL1 renderer' },
  { label: 'Canvas', value: 'canvas', description: '2D Canvas renderer' },
];

export const RIVE_RENDERER_STORAGE_KEY = 'gcos-rive-test:renderer-command';

export function isRiveRenderer(value: string): value is RiveRenderer {
  return riveRenderers.some((renderer) => renderer.value === value);
}

export type RiveControl = {
  name: string;
  type: RiveControlType;
  source: RiveControlSource;
  viewModel?: string;
  artboard?: string;
  stateMachine?: string;
  initialValue?: boolean | number;
  values?: string[];
};

export type RiveProject = {
  id: string;
  label: string;
  fileName: string;
  artboard?: string;
  stateMachines?: string | string[];
  bootTriggers?: string[];
  nestedViewModelPaths?: string[];
  controls: RiveControl[];
};

export const riveProjects: RiveProject[] = [
  {
    id: 'interchangeable-image',
    label: 'Interchangeable Image',
    fileName: 'gcos_u_i_interchangeableimagecomponent_v001.riv',
    artboard: '01_InterchangableImageArtBoard_v001 ',
    stateMachines: 'InterchangableImageStateMachine',
    bootTriggers: ['buildInTrigger'],
    controls: [
      { name: 'motoBkgColor', type: 'enumType', source: 'viewModel', viewModel: 'N1InterchangeableImageViewModelV001', values: ['none', 'dark'] },
      { name: 'imageGiftEnum', type: 'enumType', source: 'viewModel', viewModel: 'N1InterchangeableImageViewModelV001', values: ['imgMotoSoundFlow', 'imgGiftMotoTag2', 'imgGiftMotoWatch', 'ImgGiftMotoBuds2Plus'] },
      { name: 'playerColorEnum', type: 'enumType', source: 'viewModel', viewModel: 'N1InterchangeableImageViewModelV001', values: ['default', 'orange', 'blue'] },
      { name: 'artboardResolutionPOTEnum', type: 'enumType', source: 'viewModel', viewModel: 'N1InterchangeableImageViewModelV001', values: ['128', '256', '512', '1024', '2048', '4096'] },
      { name: 'showPrizeBoolean', type: 'boolean', source: 'viewModel', viewModel: 'N1InterchangeableImageViewModelV001', initialValue: false },
      { name: 'buildInTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1InterchangeableImageViewModelV001' },
      { name: 'buildOutTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1InterchangeableImageViewModelV001' },
    ],
  },
  {
    id: 'obstacle-course',
    label: 'Obstacle Course',
    fileName: 'gcos_u_i_obstaclecourse_v001.riv',
    artboard: 'obstacleCourse',
    stateMachines: 'ObstacleCourseArtBoardStateMachine',
    bootTriggers: ['initializeArtBoardTrigger', 'splashScreenBuildInTrigger'],
    nestedViewModelPaths: ['playerOrangeViewModel', 'playerBlueViewModel', 'n1PreCountdownViewModelV001'],
    controls: [
      { name: 'startNextLineTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N2PlayerViewModel' },
      { name: 'isWinnerTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N2PlayerViewModel' },
      { name: 'hideMotorolaLogoTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ObstacleCourseViewModelV001' },
      { name: 'resetWinnerTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ObstacleCourseViewModelV001' },
      { name: 'resetGameTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ObstacleCourseViewModelV001' },
      { name: 'startGameTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ObstacleCourseViewModelV001' },
      { name: 'initializeArtBoardTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ObstacleCourseViewModelV001' },
      { name: 'splashScreenBuildInTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ObstacleCourseViewModelV001' },
      { name: 'preCountdownTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1PreCountdownViewModelV001' },
      { name: 'buildInTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1PreCountdownViewModelV001' },
    ],
  },
  {
    id: 'pre-countdown',
    label: 'Pre Countdown',
    fileName: 'gcos_u_i_precountdown_v001.riv',
    artboard: '01_CoundownArtBoard_v001',
    stateMachines: 'PreCountdownArtBoardStateMachine',
    bootTriggers: ['buildInTrigger'],
    controls: [
      { name: 'preCountdownTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1PreCountdownViewModelV001' },
      { name: 'buildInTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1PreCountdownViewModelV001' },
    ],
  },
  {
    id: 'shooting-zone',
    label: 'Shooting Zone',
    fileName: 'gcos_u_i_shootingzone_v001.riv',
    artboard: '01_ShootingZoneArtBoard_v001',
    stateMachines: 'ShootingZoneArtBoardStateMachine',
    bootTriggers: ['buildInTrigger'],
    controls: [
      { name: 'missTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ShootingZoneViewModelV001' },
      { name: 'makeTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ShootingZoneViewModelV001' },
      { name: 'buildInTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1ShootingZoneViewModelV001' },
    ],
  },
  {
    id: 'splash-screen',
    label: 'Splash Screen',
    fileName: 'gcos_u_i_splashscreen_v001.riv',
    artboard: '01_SplashScreenArtBoard_v001',
    stateMachines: 'SplashScreenStateMachine',
    bootTriggers: ['splashScreenBuildInTrigger'],
    controls: [
      { name: 'splashScreenBuildInTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1SplashScreenViewModelV001' },
      { name: 'splashScreenBuildOutTrigger', type: 'trigger', source: 'viewModel', viewModel: 'N1SplashScreenViewModelV001' },
    ],
  },
];

export function findRiveProject(projectId: string): RiveProject | undefined {
  return riveProjects.find((project) => project.id === projectId);
}

export function riveControlKey(control: RiveControl): string {
  return [control.source, control.viewModel ?? '', control.artboard ?? '', control.stateMachine ?? '', control.name].join(':');
}
