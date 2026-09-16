import { deviceClient } from '@/clients/device.client';
import { getDeviceLabel, getDeviceType, getSessionId } from '@/lib/session-device';
import type { Device, DeviceCommand, Task } from '@/shared';

let devices: Device[] = [];
let myDeviceId: string | null = null;
let stop: (() => void) | null = null;
let lastReconnectAt = 0;
const listeners = new Set<() => void>();
const commandHandlers = new Set<(command: DeviceCommand) => void>();
const registrationHandlers = new Set<() => void>();
const taskHandlers = new Set<(task: Task) => void>();
const RECONNECT_THROTTLE_MS = 5_000;
const STREAM_SILENCE_MS = 60_000;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;

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

export function reconnect() {
  const now = Date.now();
  if (now - lastReconnectAt < RECONNECT_THROTTLE_MS) {
    return;
  }

  if (listeners.size === 0 && commandHandlers.size === 0 && taskHandlers.size === 0) {
    return;
  }

  lastReconnectAt = now;
  stop?.();
  stop = null;
  myDeviceId = null;
  start();
}
