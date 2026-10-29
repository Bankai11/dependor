// website/lib/checklist-store.ts
//
// A tiny localStorage-backed store for "which items are ticked", exposed to
// React through useSyncExternalStore. The server snapshot is always empty, so
// SSR and hydration render an unticked list and the client re-renders with
// the stored state immediately afterwards, without a setState-in-effect.
import { useCallback, useSyncExternalStore } from 'react';

interface StoredState {
  version: 1;
  checked: readonly string[];
}

const EMPTY: readonly string[] = Object.freeze([]);

function parse(raw: string | null): readonly string[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return parsed.version === 1 && Array.isArray(parsed.checked)
      ? Object.freeze(parsed.checked.filter((id): id is string => typeof id === 'string'))
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

interface Store {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly string[];
  getServerSnapshot(): readonly string[];
  set(next: readonly string[]): void;
}

function createStore(key: string): Store {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue: readonly string[] = EMPTY;
  // Used when localStorage is unavailable (private mode, quota, disabled).
  let memory: readonly string[] | null = null;

  const readRaw = (): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const notify = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot() {
      if (memory) return memory;
      const raw = readRaw();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = parse(raw);
      }
      return cachedValue;
    },
    getServerSnapshot() {
      return EMPTY;
    },
    set(next) {
      const frozen = Object.freeze([...next]);
      try {
        if (frozen.length === 0) window.localStorage.removeItem(key);
        else {
          const state: StoredState = { version: 1, checked: frozen };
          window.localStorage.setItem(key, JSON.stringify(state));
        }
        memory = null;
      } catch {
        memory = frozen;
      }
      notify();
    },
  };
}

const stores = new Map<string, Store>();

function storeFor(key: string): Store {
  let store = stores.get(key);
  if (!store) {
    store = createStore(key);
    stores.set(key, store);
  }
  return store;
}

/**
 * Ticked ids persisted under `key`, plus a toggle and a reset. Safe to call
 * during SSR; the server always sees an empty list.
 */
export function useStoredChecklist(key: string): {
  checked: readonly string[];
  toggle: (id: string) => void;
  reset: () => void;
} {
  const store = storeFor(key);
  const checked = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  const toggle = useCallback(
    (id: string) => {
      const current = store.getSnapshot();
      store.set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    },
    [store],
  );

  const reset = useCallback(() => store.set(EMPTY), [store]);

  return { checked, toggle, reset };
}
