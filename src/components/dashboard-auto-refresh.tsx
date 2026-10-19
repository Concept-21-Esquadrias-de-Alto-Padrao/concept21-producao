"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type DashboardAutoRefreshProps = {
  intervalMs?: number;
};

export function DashboardAutoRefresh({ intervalMs = 10000 }: DashboardAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    const interval = window.setInterval(refreshWhenVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [intervalMs, router]);

  return null;
}
