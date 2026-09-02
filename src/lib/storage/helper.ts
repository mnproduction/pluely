import { PRIVATE_KEYS, getPrivate, setPrivate } from "./private-storage";

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (PRIVATE_KEYS.has(key)) return getPrivate(key);
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (PRIVATE_KEYS.has(key)) { setPrivate(key, value); return; }
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string): void => {
    if (PRIVATE_KEYS.has(key)) { setPrivate(key, null); return; }
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};
