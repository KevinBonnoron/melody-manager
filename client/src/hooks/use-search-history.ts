import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'melody-manager-search-history';
const MAX_HISTORY = 10;
let listeners: Array<() => void> = [];
let cachedSnapshot: string[] | null = null;
function emitChange() {
  cachedSnapshot = null;
  for (const listener of listeners) {
    listener();
  }
}

function getSnapshot(): string[] {
  if (cachedSnapshot === null) {
    try {
      cachedSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      cachedSnapshot = [];
    }
  }

  return cachedSnapshot as string[];
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function useSearchHistory() {
  const history = useSyncExternalStore(subscribe, getSnapshot);
  const addEntry = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    const current = getSnapshot();
    const filtered = current.filter((q) => q !== trimmed);
    const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    emitChange();
  }, []);

  const removeEntry = useCallback((query: string) => {
    const current = getSnapshot();
    const updated = current.filter((q) => q !== query);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    emitChange();
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    emitChange();
  }, []);

  return { history, addEntry, removeEntry, clearHistory };
}
