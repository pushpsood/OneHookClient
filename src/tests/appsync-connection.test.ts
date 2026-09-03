import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The event-driven replacement for polling.
 *
 * Amplify re-establishes a dropped subscription by itself, so the only genuine gap is that it does not
 * replay what was published while the socket was down. These tests pin the one signal that closes that
 * gap — a return to `Connected` AFTER a disruption — and, just as importantly, pin that it does NOT
 * fire on an ordinary first connect, which would turn every page load into a redundant refetch.
 */

type HubHandler = (capsule: { payload?: { event?: string; data?: unknown } }) => void;

const handlers: HubHandler[] = [];
const unsubscribes: Array<() => void> = [];

vi.mock('aws-amplify/utils', () => ({
  Hub: {
    listen: (_channel: string, handler: HubHandler) => {
      handlers.push(handler);
      const stop = vi.fn();
      unsubscribes.push(stop);
      return stop;
    },
  },
}));

vi.mock('aws-amplify/api', () => ({
  CONNECTION_STATE_CHANGE: 'ConnectionStateChange',
  ConnectionState: {
    Connected: 'Connected',
    ConnectedPendingNetwork: 'ConnectedPendingNetwork',
    ConnectionDisrupted: 'ConnectionDisrupted',
    ConnectionDisruptedPendingNetwork: 'ConnectionDisruptedPendingNetwork',
    Connecting: 'Connecting',
    ConnectedPendingDisconnect: 'ConnectedPendingDisconnect',
    Disconnected: 'Disconnected',
    ConnectedPendingKeepAlive: 'ConnectedPendingKeepAlive',
  },
}));

const { onAppSyncConnectionRestored } = await import('../api/appsync-connection');

/** Pushes a connection-state event to every registered listener. */
function emit(connectionState: string) {
  for (const handler of handlers) {
    handler({ payload: { event: 'ConnectionStateChange', data: { connectionState } } });
  }
}

describe('onAppSyncConnectionRestored', () => {
  beforeEach(() => {
    handlers.length = 0;
    unsubscribes.length = 0;
  });

  it('does not fire on a first connect, when nothing has been missed', () => {
    const onRestored = vi.fn();
    onAppSyncConnectionRestored(onRestored);

    emit('Connecting');
    emit('Connected');

    expect(onRestored).not.toHaveBeenCalled();
  });

  it('fires once the connection recovers from a disruption', () => {
    const onRestored = vi.fn();
    onAppSyncConnectionRestored(onRestored);

    emit('Connected');
    emit('ConnectionDisrupted');
    emit('Connected');

    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it.each([
    'ConnectionDisrupted',
    'ConnectionDisruptedPendingNetwork',
    'Disconnected',
    'ConnectedPendingNetwork',
  ])('treats %s as a disruption worth refetching after', (state) => {
    const onRestored = vi.fn();
    onAppSyncConnectionRestored(onRestored);

    emit(state);
    emit('Connected');

    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('fires again on a second disruption, not only the first', () => {
    const onRestored = vi.fn();
    onAppSyncConnectionRestored(onRestored);

    emit('ConnectionDisrupted');
    emit('Connected');
    emit('ConnectionDisrupted');
    emit('Connected');

    expect(onRestored).toHaveBeenCalledTimes(2);
  });

  it('does not fire repeatedly while already connected', () => {
    const onRestored = vi.fn();
    onAppSyncConnectionRestored(onRestored);

    emit('ConnectionDisrupted');
    emit('Connected');
    emit('Connected');
    emit('ConnectedPendingKeepAlive');
    emit('Connected');

    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated Hub events and malformed payloads', () => {
    const onRestored = vi.fn();
    onAppSyncConnectionRestored(onRestored);

    for (const handler of handlers) {
      handler({ payload: { event: 'SomethingElse', data: { connectionState: 'Connected' } } });
      handler({ payload: { event: 'ConnectionStateChange' } });
      handler({});
    }

    expect(onRestored).not.toHaveBeenCalled();
  });

  it('returns the Hub unsubscribe handle so effects can clean up', () => {
    const stop = onAppSyncConnectionRestored(vi.fn());
    expect(typeof stop).toBe('function');
    stop();
    expect(unsubscribes[0]).toHaveBeenCalled();
  });
});
