"use client";

import { useEffect, useMemo, useState } from "react";

function parseTimeMs(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function monotonicNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function useServerSyncedNow(serverNowIso: string) {
  const serverNowMs = useMemo(() => parseTimeMs(serverNowIso), [serverNowIso]);
  const [nowMs, setNowMs] = useState(serverNowMs);

  useEffect(() => {
    const monotonicStartMs = monotonicNow();
    const intervalId = window.setInterval(() => {
      setNowMs(serverNowMs + (monotonicNow() - monotonicStartMs));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [serverNowMs]);

  return nowMs;
}
