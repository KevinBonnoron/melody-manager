import { deviceClient } from '@/clients/device.client';
import { getDeviceLabel, getDeviceType, getSessionId } from '@/lib/session-device';
import type { Device, DeviceCommand, Task } from '@/shared';

// One SSE connection for the whole app: every consumer reads the same snapshot
// instead of opening a stream of its own.
let devices: Device[] = [];
// The server owns device ids; commands are filtered against the one it sent
// back when the stream opened.
let myDeviceId: string | null = null;
let stop: (() => void) | null = null;
let lastReconnectAt = 0;
const listeners = new Set<() => void>();
const commandHandlers = new Set<(command: DeviceCommand) => void>();
const registrationHandlers = new Set<() => void>();
const taskHandlers = new Set<(task: Task) => void>();
// Shorter than STREAM_SILENCE_MS, and it has to stay that way: the watchdog
// nulls its own timer before calling reconnect, so a reconnect throttled at
// that moment would leave no stream open and nothing armed to open one.
const RECONNECT_THROTTLE_MS = 5_000;
// Longer than two keep-alives: one may be lost without the stream being dead.
const STREAM_SILENCE_MS = 60_000;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;

// A stream that ends cleanly raises no error the browser reports, so silence is
// the only symptom. The server sends proof of life on a fixed schedule; going
// without it for longer than that schedule allows means the stream is gone and
// this client no longer exists server-side.
function noteAlive() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
  }

  silenceTimer = setTimeout(() => {
    silenceTimer = null;
    reconnect();
  }, STREAM_SILENCE_MS);
}

function stopWatching() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function start() {
  if (stop) {
    return;
  }

  noteAlive();
  stop = deviceClient.events(
    { type: getDeviceType(), session: getSessionId(), name: getDeviceLabel() },
    {
      ping: noteAlive,
      devices: (next) => {
        noteAlive();
        devices = next;
        for (const listener of listeners) {
          listener();
        }
      },
      registered: (device) => {
        noteAlive();
        myDeviceId = device.id;
        // A re-registered device starts blank server-side; whatever this client
        // is doing has to be restated or the others see it back at zero.
        for (const handler of registrationHandlers) {
          handler();
        }
      },
      command: (command) => {
        noteAlive();
        for (const handler of commandHandlers) {
          handler(command);
        }
      },
      task: (task) => {
        noteAlive();
        for (const handler of taskHandlers) {
          handler(task);
        }
      },
    },
    reconnect,
  );
}

function stopIfIdle() {
  if (listeners.size > 0 || commandHandlers.size > 0 || taskHandlers.size > 0) {
    return;
  }

  stop?.();
  stop = null;
  stopWatching();
  devices = [];
  myDeviceId = null;
}

export function subscribeDevices(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    stopIfIdle();
  };
}

export function subscribeCommands(handler: (command: DeviceCommand) => void): () => void {
  commandHandlers.add(handler);
  start();
  return () => {
    commandHandlers.delete(handler);
    stopIfIdle();
  };
}

// Tasks ride the same stream; the subscription keeps it open on its own so the
// notification bell works on a page with no player mounted.
export function subscribeTasks(handler: (task: Task) => void): () => void {
  taskHandlers.add(handler);
  start();
  return () => {
    taskHandlers.delete(handler);
    stopIfIdle();
  };
}

export function subscribeRegistration(handler: () => void): () => void {
  registrationHandlers.add(handler);
  return () => {
    registrationHandlers.delete(handler);
  };
}

export function getDevices(): Device[] {
  return devices;
}

export function getMyDeviceId(): string | null {
  return myDeviceId;
}

// A stream that died leaves this client holding an id the server has forgotten,
// and every report from then on is shouted into the void. Reopening it earns a
// fresh registration, throttled so a server that is down is not hammered.
export function reconnect() {
  const now = Date.now();
  if (now - lastReconnectAt < RECONNECT_THROTTLE_MS) {
    return;
  }

  // Nothing to hold open for: this is called from the stream's own error
  // handler, which can fire before `stop` has even been assigned.
  if (listeners.size === 0 && commandHandlers.size === 0 && taskHandlers.size === 0) {
    return;
  }

  lastReconnectAt = now;
  stop?.();
  stop = null;
  myDeviceId = null;
  start();
}
