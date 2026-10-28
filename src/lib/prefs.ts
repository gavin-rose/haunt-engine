"use client";

import { useCallback, useSyncExternalStore } from "react";

// Tiny localStorage-backed preferences (difficulty, mute). Server render uses the fallback.

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(key) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
