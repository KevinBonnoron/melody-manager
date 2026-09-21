import { deviceClient } from '@/clients/device.client';
import { getDeviceLabel, getDeviceType, getSessionId } from '@/lib/session-device';
import { storedVolume } from '@/lib/volume';
import type { Device, DeviceCommand, Task } from '@/shared';

let devices: Device[] = [];
let myDeviceId: string | null = null;
let stop: (() => void) | null = null;
let lastReconnectAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const commandHandlers = new Set<(command: DeviceCommand) => void>();
const registrationHandlers = new Set<() => void>();
const taskHandlers = new Set<(task: Task) => void>();
// How long to wait before trying the stream again, doubling while it keeps
// refusing and reset once one is up. A connection is refused for a moment far
// more often than for good, so the first retry comes quickly; a server that is
// really down is not hammered, because each refusal pushes the next attempt
// further out.
//
// The longest wait stays well inside the half minute the server holds a
// device's place for. Waiting as long as it does would let the place go just
// as the stream came back, which is the one moment the waiting was for.
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 10_000;
let retryIn = RETRY_MIN_MS;
const STREAM_SILENCE_MS = 60_000;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastAliveAt = 0;

function noteAlive() {
  lastAliveAt = Date.now();
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
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function start() {
  if (stop) {
    return;
  }

  noteAlive();
  stop = deviceClient.events(
    { type: getDeviceType(), session: getSessionId(), name: getDeviceLabel(), volume: Math.round(storedVolume() * 100) },
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
        retryIn = RETRY_MIN_MS;
        myDeviceId = device.id;
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

/**
 * checkAlive reconnects a stream that has gone quiet for longer than it should.
 * The timer that would have noticed is a timeout, and a browser stretches those
 * to minutes for a tab in the background, so a tab coming back asks here rather
 * than waiting for one that was due while nobody was looking.
 */
export function checkAlive() {
  if (!stop || Date.now() - lastAliveAt < STREAM_SILENCE_MS) {
    return;
  }
  reconnect();
}

function wanted() {
  return listeners.size > 0 || commandHandlers.size > 0 || taskHandlers.size > 0;
}

/**
 * reconnect asks for the stream again, waiting out whatever is left of the
 * back-off first. An attempt that is too soon is put off rather than dropped:
 * one that is dropped is never made, and a device with no stream is one the
 * playback is told has gone.
 */
export function reconnect() {
  if (retryTimer || !wanted()) {
    return;
  }

  const waited = Date.now() - lastReconnectAt;
  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      if (wanted()) {
        attempt();
      }
    },
    Math.max(0, retryIn - waited),
  );
}

function attempt() {
  lastReconnectAt = Date.now();
  retryIn = Math.min(retryIn * 2, RETRY_MAX_MS);

  // Closed before the new one is opened, because there is one connection and
  // closing is how it is given up: opening a second only replaces the first,
  // and giving up the first afterwards gives up the one that replaced it. What
  // keeps the device in the playback across this is the server holding its
  // place for a moment, not the two streams overlapping.
  stop?.();
  stop = null;
  myDeviceId = null;
  start();
}
