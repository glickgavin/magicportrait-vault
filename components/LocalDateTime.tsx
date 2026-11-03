"use client";

import { useEffect, useState } from "react";

/** Shows a time in the viewer's own time zone, e.g. "31 Dec, 18:00". */
export function LocalDateTime({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const [text, setText] = useState(() => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(iso)));
  useEffect(() => {
    setText(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)));
  }, [iso]);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {prefix}
      {text}
    </time>
  );
}
