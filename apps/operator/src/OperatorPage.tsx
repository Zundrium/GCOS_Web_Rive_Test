import { useEffect, useRef, useState } from 'react';
import {
  ConnectionStatus,
  Group,
  Label,
  StatusBar,
  TabletFrame,
  Toggle,
} from '@gcos/web-ui-react';
import { connect, disconnect, emit, on } from '@gcos/io';
import './OperatorPage.scss';

type ConnectionState = 'connecting' | 'connected' | 'error';

export function OperatorPage() {
  const [subscribed, setSubscribed] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const unsub = on('/SubscribeToggle', (payload) => {
      if (payload.subscribed !== undefined) setSubscribed(payload.subscribed);
    });

    const connectWithRetry = async () => {
      try {
        await connect({ source: 'rive-test-operator' });
        if (!cancelled) setConnectionState('connected');
      } catch {
        if (cancelled) return;
        setConnectionState('error');
        retryTimerRef.current = window.setTimeout(() => {
          if (cancelled) return;
          setConnectionState('connecting');
          void connectWithRetry();
        }, 3000);
      }
    };

    void connectWithRetry();

    return () => {
      cancelled = true;
      unsub();
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      void disconnect();
    };
  }, []);

  const toggleSubscribe = (next: boolean) => {
    setSubscribed(next);
    void emit('/SubscribeToggle', { subscribed: next });
  };

  return (
    <TabletFrame
      subtitle="Rive Test"
      maxSize
      statusBar={
        <StatusBar className="operator__statusbar">
          <ConnectionStatus status={connectionState} fixed={false} />
        </StatusBar>
      }
    >
      <div className="operator">
        <Group title="Subscribe">
          <div className="operator__toggle-row">
            <Label>Subscribed</Label>
            <Toggle checked={subscribed} onChange={toggleSubscribe} />
          </div>
        </Group>
      </div>
    </TabletFrame>
  );
}
