"use client";

import { createContext, useContext } from "react";
import { DEFAULT_BIZ_TZ } from "@/lib/biztime";

/** The business time zone for Settings' client components (set once in AdminShell from `brand.timezone`). */
const Ctx = createContext<string>(DEFAULT_BIZ_TZ);

export function BizTimeProvider({ tz, children }: { tz: string; children: React.ReactNode }) {
  return <Ctx.Provider value={tz}>{children}</Ctx.Provider>;
}

export function useBizTz(): string {
  return useContext(Ctx);
}
