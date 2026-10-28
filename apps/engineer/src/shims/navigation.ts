// The two next/navigation hooks the field screens use, on plain browser history.
import { useEffect, useState } from "react";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

export function useRouter() {
  return {
    push: (url: string) => { window.history.pushState(null, "", toApp(url)); notify(); },
    replace: (url: string) => { window.history.replaceState(null, "", toApp(url)); notify(); },
    back: () => window.history.back(),
  };
}

export function useSearchParams() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const l = () => setSearch(window.location.search);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return new URLSearchParams(search);
}

/** "/field?job=1" -> "?job=1" on the app's own page */
function toApp(url: string) {
  const q = url.indexOf("?");
  return window.location.pathname + (q >= 0 ? url.slice(q) : "");
}
