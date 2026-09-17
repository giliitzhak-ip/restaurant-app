/**
 * Favourites live in a tiny external store rather than component state.
 *
 * Guests keep them in localStorage (no sign-up wall on "save for later") and
 * signed-in customers keep them on the server. Both feed the same store, so
 * `useSyncExternalStore` can read it without hydration mismatches or
 * setState-in-effect gymnastics.
 */
const STORAGE_KEY = "tn_favorites";

let snapshot: ReadonlySet<string> = new Set();
let serverSnapshot: ReadonlySet<string> = new Set();
let persistLocally = true;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    // Private mode or blocked storage — favourites simply do not persist.
    return [];
  }
}

function writeLocal(values: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...values]));
  } catch {
    /* ignore */
  }
}

/** Called once per mount with what the server knows. */
export function initFavorites(serverFavorites: string[], signedIn: boolean) {
  serverSnapshot = new Set(serverFavorites);
  persistLocally = !signedIn;
  const next = signedIn ? new Set(serverFavorites) : new Set(readLocal());
  if (
    next.size !== snapshot.size ||
    [...next].some((id) => !snapshot.has(id))
  ) {
    snapshot = next;
    emit();
  }
}

export function subscribeFavorites(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      snapshot = new Set(readLocal());
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getFavoritesSnapshot(): ReadonlySet<string> {
  return snapshot;
}

export function getFavoritesServerSnapshot(): ReadonlySet<string> {
  return serverSnapshot;
}

/** Returns true when the product ended up favourited. */
export function toggleFavoriteLocal(productId: string) {
  const next = new Set(snapshot);
  const added = !next.has(productId);
  if (added) next.add(productId);
  else next.delete(productId);
  snapshot = next;
  if (persistLocally) writeLocal(next);
  emit();
  return added;
}
