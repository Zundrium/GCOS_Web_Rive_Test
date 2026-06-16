declare module '@gcos/io' {
  export interface SubscribeTogglePayload {
    subscribed: boolean;
  }

  export function connect(options?: { source?: string }): Promise<void>;
  export function disconnect(): Promise<void>;
  export function emit(topic: '/SubscribeToggle', payload: SubscribeTogglePayload): Promise<void>;
  export function on(topic: '/SubscribeToggle', handler: (payload: SubscribeTogglePayload) => void): () => void;
}
