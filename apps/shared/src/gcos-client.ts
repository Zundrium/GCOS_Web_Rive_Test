import { connect, disconnect } from '@gcos/io';

export type GcosConnectionState = 'connecting' | 'connected' | 'error';

export type GcosConnectionOptions = {
  source: string;
  retryMs?: number;
  onStateChange?: (state: GcosConnectionState) => void;
};

export type GcosConnectionHandle = {
  stop: () => void;
};

export function appServerWsUrl(): string {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const explicitUrl = viteEnv?.VITE_APP_SERVER_WS_URL;
  if (explicitUrl) return explicitUrl;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export function connectGcos({ source, retryMs = 3000, onStateChange }: GcosConnectionOptions): GcosConnectionHandle {
  let stopped = false;
  let retryTimer: number | null = null;

  const setState = (state: GcosConnectionState) => onStateChange?.(state);

  const connectOnce = async () => {
    setState('connecting');
    try {
      await connect({ source, url: appServerWsUrl() });
      if (!stopped) setState('connected');
    } catch (error) {
      console.warn('[gcos] connect failed; retrying', error);
      if (stopped) return;
      setState('error');
      retryTimer = window.setTimeout(connectOnce, retryMs);
    }
  };

  void connectOnce();

  return {
    stop: () => {
      stopped = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      void disconnect();
    },
  };
}
