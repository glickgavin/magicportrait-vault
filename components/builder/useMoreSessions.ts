"use client";

import { useCallback, useState } from "react";
import type { BuilderData, ClientSession } from "./types";

/**
 * The pickers' sessions: the newest ones from the page, then all of them once "Show more" is tapped
 * (read from /api/portraits, the signed-in person's own only).
 */
export function useMoreSessions(data: BuilderData) {
  const [loaded, setLoaded] = useState<ClientSession[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sessions = loaded ?? data.sessions;
  const more = loaded ? 0 : data.moreSessions;
  const loadMore = useCallback(async () => {
    if (loading || loaded) return;
    setLoading(true);
    setFailed(false);
    const r = await fetch("/api/portraits", { cache: "no-store" }).catch(() => null);
    const b = r?.ok ? ((await r.json().catch(() => null)) as { sessions?: ClientSession[] } | null) : null;
    if (b?.sessions) setLoaded(b.sessions);
    else setFailed(true);
    setLoading(false);
  }, [loading, loaded]);
  return { sessions, more, loading, failed, loadMore };
}
