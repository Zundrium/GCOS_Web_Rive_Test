import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  ConnectionStatus,
  Group,
  Label,
  Select,
  StatusBar,
  TabletFrame,
  Toggle,
} from '@gcos/web-ui-react';
import { emit, on, type X2fRiveRenderStatsPayload } from '@gcos/io';
import { connectGcos, type GcosConnectionState } from '../../shared/src/gcos-client';
import {
  RIVE_RENDERER_STORAGE_KEY,
  riveControlKey,
  riveProjects,
  riveRenderers,
  type RiveControl,
  type RiveControlValue,
  type RiveRenderer,
} from '../../shared/src/rive-projects';
import './OperatorPage.scss';

export function OperatorPage() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [controlValues, setControlValues] = useState<Record<string, RiveControlValue>>({});
  const [connectionState, setConnectionState] = useState<GcosConnectionState>('connecting');
  const [renderScalePercent, setRenderScalePercent] = useState(100);
  const [renderer, setRenderer] = useState<RiveRenderer>('webgl2');
  const [renderStats, setRenderStats] = useState<X2fRiveRenderStatsPayload | null>(null);

  const selectedProject = useMemo(
    () => riveProjects.find((project) => project.id === selectedProjectId),
    [selectedProjectId],
  );

  useEffect(() => {
    const unsubscribeRenderStats = on('/RiveRenderStats', setRenderStats);
    const connection = connectGcos({
      source: 'rive-project-operator',
      onStateChange: setConnectionState,
    });

    return () => {
      unsubscribeRenderStats();
      connection.stop();
    };
  }, []);

  useEffect(() => {
    if (connectionState !== 'connected') return;

    if (!selectedProject) {
      void emit('/RiveProjectSelected', {
        projectId: '',
        projectLabel: '',
        renderer,
      });
      return;
    }

    void emit('/RiveProjectSelected', {
      projectId: selectedProject.id,
      projectLabel: selectedProject.label,
      renderer,
    });
  }, [connectionState, selectedProject, renderer]);

  useEffect(() => {
    if (connectionState !== 'connected') return;

    void emit('/RiveRenderQualityChanged', {
      scalePercent: renderScalePercent,
      renderer,
    });
  }, [connectionState, renderScalePercent, renderer]);

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setControlValues({});
  };

  const selectRenderScale = (value: string) => {
    setRenderScalePercent(Number(value));
  };

  const selectRenderer = (value: string) => {
    const nextRenderer: RiveRenderer = value === 'canvas' || value === 'webgl1' ? value : 'webgl2';
    setRenderer(nextRenderer);
    setRenderStats(null);
    publishRendererFallback(nextRenderer);
  };

  const publishRendererFallback = (nextRenderer: RiveRenderer) => {
    window.localStorage.setItem(RIVE_RENDERER_STORAGE_KEY, JSON.stringify({
      renderer: nextRenderer,
      ts: Date.now(),
    }));
  };

  const fireTrigger = (control: RiveControl) => {
    if (!selectedProject) return;

    void emit('/RiveControlChanged', {
      projectId: selectedProject.id,
      projectLabel: selectedProject.label,
      controlName: control.name,
      controlType: control.type,
      source: control.source,
      viewModel: control.viewModel,
      artboard: control.artboard,
      stateMachine: control.stateMachine,
    });
  };

  const setControlValue = (control: RiveControl, value: RiveControlValue) => {
    if (!selectedProject) return;

    setControlValues((current) => ({ ...current, [riveControlKey(control)]: value }));

    void emit('/RiveControlChanged', {
      projectId: selectedProject.id,
      projectLabel: selectedProject.label,
      controlName: control.name,
      controlType: control.type,
      source: control.source,
      viewModel: control.viewModel,
      artboard: control.artboard,
      stateMachine: control.stateMachine,
      valueString: typeof value === 'string' ? value : undefined,
      valueNumber: typeof value === 'number' ? value : undefined,
      valueBoolean: typeof value === 'boolean' ? value : undefined,
    });
  };

  const renderResolution = renderStats
    ? `${renderStats.renderWidth} × ${renderStats.renderHeight}`
    : 'waiting for interactive';
  const viewportResolution = renderStats
    ? `${renderStats.viewportWidth} × ${renderStats.viewportHeight}`
    : 'waiting for interactive';
  const fps = typeof renderStats?.fps === 'number' ? renderStats.fps.toFixed(1) : 'waiting';

  return (
    <TabletFrame
      subtitle="Rive Projects"
      maxSize
      statusBar={
        <StatusBar className="operator__statusbar">
          <ConnectionStatus status={connectionState} fixed={false} />
        </StatusBar>
      }
    >
      <div className="operator">
        <Group title="Rive project">
          <div className="operator__field">
            <Label>Project</Label>
            <Select
              value={selectedProject?.id ?? ''}
              onChange={selectProject}
              options={riveProjects.map((project) => ({
                label: project.label,
                value: project.id,
              }))}
              placeholder="Select a Rive project"
              autoPosition
            />
          </div>

          {selectedProject ? (
            <div className="operator__project-meta">
              <span>{selectedProject.controls.length} unique controls</span>
            </div>
          ) : null}
        </Group>

        <Group title="Interactive performance">
          <div className="operator__field">
            <Label>Renderer</Label>
            <Select
              value={renderer}
              onChange={selectRenderer}
              options={riveRenderers.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              autoPosition
            />
          </div>

          <div className="operator__field">
            <Label>Render resolution</Label>
            <Select
              value={String(renderScalePercent)}
              onChange={selectRenderScale}
              options={[
                { label: '100% native', value: '100' },
                { label: '75% balanced', value: '75' },
                { label: '67% recommended', value: '67' },
                { label: '50% low GPU load', value: '50' },
              ]}
              autoPosition
            />
          </div>

          <div className="operator__render-info">
            <div>
              <span>Renderer</span>
              <strong>{renderStats?.renderer ?? renderer}</strong>
            </div>
            <div>
              <span>Actual render</span>
              <strong>{renderResolution}</strong>
            </div>
            <div>
              <span>Viewport</span>
              <strong>{viewportResolution}</strong>
            </div>
            <div>
              <span>Scale reported</span>
              <strong>{renderStats ? `${renderStats.scalePercent}%` : 'waiting'}</strong>
            </div>
            <div>
              <span>FPS</span>
              <strong>{fps}</strong>
            </div>
          </div>
        </Group>

        {selectedProject ? (
          <Group title="Controls">
            <div className="operator__controls">
              {selectedProject.controls.map((control) => (
                <ControlRow
                  key={riveControlKey(control)}
                  control={control}
                  value={controlValues[riveControlKey(control)]}
                  onTrigger={() => fireTrigger(control)}
                  onValueChange={(value) => setControlValue(control, value)}
                />
              ))}
            </div>
          </Group>
        ) : null}
      </div>
    </TabletFrame>
  );
}

type ControlRowProps = {
  control: RiveControl;
  value: RiveControlValue | undefined;
  onTrigger: () => void;
  onValueChange: (value: RiveControlValue) => void;
};

function ControlRow({ control, value, onTrigger, onValueChange }: ControlRowProps) {
  const subtitle = control.viewModel ?? [control.artboard, control.stateMachine].filter(Boolean).join(' / ');

  return (
    <div className="operator__control-row">
      <div className="operator__control-copy">
        <Label>{control.name}</Label>
        <span>{control.type}{subtitle ? ` · ${subtitle}` : ''}</span>
      </div>

      {control.type === 'trigger' ? (
        <Button compact onClick={onTrigger}>Fire</Button>
      ) : null}

      {control.type === 'boolean' ? (
        <Toggle
          checked={Boolean(value ?? control.initialValue ?? false)}
          onChange={(next) => onValueChange(next)}
        />
      ) : null}

      {control.type === 'enumType' ? (
        <Select
          compact
          value={String(value ?? control.values?.[0] ?? '')}
          onChange={onValueChange}
          options={(control.values ?? []).map((option) => ({ label: option, value: option }))}
          placeholder="Select value"
          autoPosition
        />
      ) : null}

      {control.type === 'number' ? (
        <input
          className="operator__number"
          type="number"
          value={Number(value ?? control.initialValue ?? 0)}
          onChange={(event) => onValueChange(Number(event.currentTarget.value))}
        />
      ) : null}
    </div>
  );
}
