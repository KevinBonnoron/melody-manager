import type { WatchProvider } from './types';

class WatchRegistry {
  private readonly watchers = new Map<string, WatchProvider>();

  public register(id: string, watcher: WatchProvider): void {
    this.watchers.set(id, watcher);
  }

  public get(id: string): WatchProvider | undefined {
    return this.watchers.get(id);
  }

  public getIds(): string[] {
    return Array.from(this.watchers.keys());
  }
}

export const watchRegistry = new WatchRegistry();
