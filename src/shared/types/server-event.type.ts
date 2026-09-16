import type { Device, DeviceCommand } from './device.type';
import type { Task } from './task.type';

export const SERVER_EVENTS = {
  /** This client's own device, once, when the stream opens. */
  registered: 'registered',
  /** The user's device list, whenever it changes. */
  devices: 'devices',
  /** A transport action aimed at one device. */
  command: 'command',
  /** Progress of a background job. */
  task: 'task',
  /** Proof the stream is still alive, so a client can tell silence from death. */
  ping: 'ping',
} as const;

export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

export interface ServerEventPayloads {
  registered: Device;
  devices: Device[];
  command: DeviceCommand;
  task: Task;
  ping: Record<string, never>;
}
