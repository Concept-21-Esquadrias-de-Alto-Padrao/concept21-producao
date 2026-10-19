"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import type { PlatformNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

type NotificationsResponse = {
  notifications?: PlatformNotification[];
  error?: string;
};

async function listUnreadNotifications() {
  const response = await fetch("/api/notifications?limit=6", {
    headers: {
      Accept: "application/json",
    },
  });
  const payload = (await response.json().catch(() => ({}))) as NotificationsResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Não foi possível carregar as notificações.");
  }

  return payload.notifications ?? [];
}

async function markNotificationRead(notificationId: string) {
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ notificationId }),
  });
  const payload = (await response.json().catch(() => ({}))) as NotificationsResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Não foi possível atualizar a notificação.");
  }
}

function getNotificationUrl(notification: PlatformNotification) {
  if (notification.entity === "access_review_request" || notification.category === "access_review") {
    return "/settings?tab=security";
  }

  if (
    notification.entity === "production_piece_stage_pending" ||
    notification.category === "pointing_pending"
  ) {
    return "/pointing";
  }

  return notification.action_url ?? "/settings";
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const {
    data,
    error: resourceError,
    reload,
    setData,
  } = useAsyncResource<PlatformNotification[]>(
    "notifications:unread",
    listUnreadNotifications,
    { ttlMs: 30000 },
  );
  const notifications = data ?? [];
  const error = resourceError
    ? toUserFriendlyErrorMessage(resourceError, "Notificações indisponíveis.")
    : null;

  useEffect(() => {
    const interval = window.setInterval(() => {
      void reload().catch(() => undefined);
    }, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, [reload]);

  async function markRead(notification: PlatformNotification) {
    setData((current) => (current ?? []).filter((item) => item.id !== notification.id));

    try {
      await markNotificationRead(notification.id);
    } catch {
      setData((current) => [notification, ...(current ?? [])]);
    }
  }

  const unreadCount = notifications.length;
  const hasPendingPointingNotification = notifications.some(
    (notification) =>
      notification.category === "pointing_pending" ||
      notification.entity === "production_piece_stage_pending",
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-md border transition",
          hasPendingPointingNotification
            ? "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50"
            : "border-zinc-200 text-zinc-600 hover:border-orange-200 hover:text-accent",
        )}
        title="Notificações"
      >
        <Bell className="size-4" />
        {unreadCount ? (
          <span
            className={cn(
              "absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold leading-none text-white",
              hasPendingPointingNotification ? "bg-red-600" : "bg-accent",
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-2rem))] rounded-md border border-border bg-white p-2 shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-charcoal">Notificações</p>
          </div>
          {notifications.length ? (
            <div className="max-h-80 overflow-y-auto py-1">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={getNotificationUrl(notification)}
                  onClick={() => {
                    setOpen(false);
                    void markRead(notification);
                  }}
                  className="block rounded-md px-3 py-2 text-sm transition hover:bg-orange-50"
                >
                  <p className="font-semibold text-charcoal">{notification.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {notification.body}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {error ?? "Nada pendente."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
