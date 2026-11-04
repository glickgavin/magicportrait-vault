"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_DRAFT, type Draft } from "./types";

// v2: the 3-step builder (4 Nov review); older drafts carried a delivery choice made before the card existed.
const KEY = "vault.card.draft.v2";

function read(): Draft {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

/** The card being built: kept in session storage (and the step's URL), so a reload keeps everything. */
export function useDraft(init?: (d: Draft) => Draft) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const d = read();
    setDraft(init ? init(d) : d);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft, ready]);
  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  return { draft, update, ready, setDraft };
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
