import { type KeyboardEvent, type PointerEvent, type RefObject, useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'melody-manager-player-dock';
// The gap the panel keeps from the window's edges, docked or dropped.
const MARGIN = 16;
const KEYBOARD_STEP = 12;
const KEYBOARD_STEP_FAST = 48;

export type PlayerDockMode = 'docked' | 'floating';

interface Point {
  x: number;
  y: number;
}

interface PlayerDockState {
  mode: PlayerDockMode;
  // Null until the panel has been dropped somewhere: the first float is placed
  // from the window's size, which is not known until it is rendered.
  position: Point | null;
}

const DEFAULT_STATE: PlayerDockState = { mode: 'docked', position: null };

let listeners: Array<() => void> = [];
let cachedSnapshot: PlayerDockState | null = null;

function parse(raw: string | null): PlayerDockState {
  if (!raw) {
    return DEFAULT_STATE;
  }

  try {
    const stored = JSON.parse(raw) as Partial<PlayerDockState>;
    const mode: PlayerDockMode = stored.mode === 'floating' ? 'floating' : 'docked';
    const point = stored.position;
    const position = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
    return { mode, position };
  } catch {
    return DEFAULT_STATE;
  }
}

function getSnapshot(): PlayerDockState {
  if (cachedSnapshot === null) {
    cachedSnapshot = parse(localStorage.getItem(STORAGE_KEY));
  }

  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function store(next: PlayerDockState) {
  cachedSnapshot = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) {
    listener();
  }
}

function clamp(point: Point, width: number, height: number): Point {
  // A window narrower than the panel would give a negative range, and the panel
  // is better hanging off the right edge than off the left one.
  const maxX = Math.max(MARGIN, window.innerWidth - width - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - height - MARGIN);
  return { x: Math.min(Math.max(point.x, MARGIN), maxX), y: Math.min(Math.max(point.y, MARGIN), maxY) };
}

// Where the bar was: the first float starts under the hand that asked for it
// rather than jumping across the screen.
function initialPoint(width: number, height: number): Point {
  return { x: window.innerWidth - width - MARGIN, y: window.innerHeight - height - MARGIN };
}

/**
 * The player's shape, shared by the bar and by the layout that reserves room
 * for it, and kept in the browser so a reload finds it where it was left.
 */
export function usePlayerDock() {
  const { mode } = useSyncExternalStore(subscribe, getSnapshot);
  const setMode = useCallback((next: PlayerDockMode) => store({ ...getSnapshot(), mode: next }), []);
  const toggleMode = useCallback(() => setMode(getSnapshot().mode === 'floating' ? 'docked' : 'floating'), [setMode]);
  return { mode, isFloating: mode === 'floating', setMode, toggleMode };
}

/**
 * The floating panel's place on screen, and the handle that moves it. The
 * position is live state while a drag is in flight and only written once it is
 * dropped, so a drag does not mean a hundred writes to `localStorage`.
 */
export function useFloatingPosition(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const stored = useSyncExternalStore(subscribe, getSnapshot).position;
  const [position, setPosition] = useState<Point | null>(stored);
  // What a drop has to save: reading it from state inside the pointerup would
  // mean a side effect in a state updater.
  const positionRef = useRef<Point | null>(stored);
  const grabRef = useRef<Point | null>(null);

  const place = useCallback((point: Point) => {
    positionRef.current = point;
    setPosition(point);
  }, []);

  // Before the first paint, so the panel never shows up at the flow position a
  // `fixed` element without insets falls back to. A resize runs it again: a
  // point stored against a wider window can sit outside this one.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      return;
    }

    const keepInWindow = () => {
      const { width, height } = element.getBoundingClientRect();
      place(clamp(positionRef.current ?? initialPoint(width, height), width, height));
    };

    keepInWindow();
    window.addEventListener('resize', keepInWindow);
    return () => window.removeEventListener('resize', keepInWindow);
  }, [enabled, ref, place]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const element = ref.current;
      if (!element || event.button !== 0) {
        return;
      }

      const rect = element.getBoundingClientRect();
      // The panel follows the point that was grabbed, not its own corner.
      grabRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      // Captured on the handle, so a fast drag that outruns the pointer keeps
      // sending moves here instead of to whatever is now underneath.
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [ref],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const grab = grabRef.current;
      const element = ref.current;
      if (!grab || !element) {
        return;
      }

      const { width, height } = element.getBoundingClientRect();
      place(clamp({ x: event.clientX - grab.x, y: event.clientY - grab.y }, width, height));
    },
    [ref, place],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!grabRef.current) {
      return;
    }

    grabRef.current = null;
    // A cancelled pointer has already lost its capture, and releasing one that
    // is no longer held throws.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (positionRef.current) {
      store({ ...getSnapshot(), position: positionRef.current });
    }
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? KEYBOARD_STEP_FAST : KEYBOARD_STEP;
      const moves: Record<string, Point | undefined> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
      const move = moves[event.key];
      const element = ref.current;
      if (!move || !element) {
        return;
      }

      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const next = clamp({ x: rect.left + move.x, y: rect.top + move.y }, rect.width, rect.height);
      place(next);
      store({ ...getSnapshot(), position: next });
    },
    [ref, place],
  );

  return { position, handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown } };
}
