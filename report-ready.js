import WebSocket from 'ws';

const CORE_URL = 'ws://localhost:3002';
const APP_ID = 'rive-test';
const RETRY_MS = 3000;
const MAX_RETRIES = 10;

let attempt = 0;

function connectToCore() {
  attempt++;
  const ws = new WebSocket(CORE_URL);

  ws.addEventListener('open', () => {
    console.log('[report-ready] Connected to Core');
    attempt = 0;
    ws.send(JSON.stringify({ topic: `/app/${APP_ID}/ready` }));
  });

  ws.addEventListener('message', (event) => {
    const rawMessage = typeof event.data === 'string' ? event.data : String(event.data);
    let topic = rawMessage;

    try {
      const parsed = JSON.parse(rawMessage);
      if (typeof parsed.topic === 'string') topic = parsed.topic;
    } catch {
      // Non-JSON payloads are supported for backwards compatibility.
    }

    console.log('[report-ready]', rawMessage);

    if (topic === `/app/${APP_ID}/shutdown`) {
      ws.send(JSON.stringify({ topic: `/app/${APP_ID}/shutdown/complete` }));
    }
  });

  ws.addEventListener('error', () => {
    // Handled by close.
  });

  ws.addEventListener('close', () => {
    if (attempt < MAX_RETRIES) {
      console.log(`[report-ready] Core not available, retrying in ${RETRY_MS / 1000}s (${attempt}/${MAX_RETRIES})`);
      setTimeout(connectToCore, RETRY_MS);
    } else {
      console.log('[report-ready] Core not available after max retries, giving up');
    }
  });
}

connectToCore();
