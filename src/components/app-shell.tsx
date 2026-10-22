"use client";

import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardCheck,
  ClipboardList,
  Factory,
  Home,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { CurrentUserMenu } from "@/components/current-user-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import {
  getCurrentUserAccess,
  isCurrentUserMaster,
  type CurrentUserAccess,
} from "@/lib/auth-client";
import { canAccessModule, MODULE_ACCESS } from "@/lib/module-access";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home, permissions: MODULE_ACCESS.dashboard },
  { href: "/clients", label: "Clientes", icon: UserRound, permissions: MODULE_ACCESS.clients },
  { href: "/carteira", label: "Carteira de obras", icon: BriefcaseBusiness, permissions: MODULE_ACCESS.contracts },
  {
    href: "/contracts",
    label: "Contratos",
    icon: ClipboardList,
    permissions: MODULE_ACCESS.contracts,
  },
  { href: "/prods", label: "PRODs", icon: Factory, permissions: MODULE_ACCESS.prods },
  {
    href: "/pointing",
    label: "Apontamentos",
    icon: ClipboardCheck,
    permissions: MODULE_ACCESS.pointing,
  },
  { href: "/reports", label: "Relatórios", icon: BarChart3, permissions: MODULE_ACCESS.reports },
  { href: "/settings", label: "Configurações", icon: Settings, permissions: MODULE_ACCESS.settings },
];

const publicRoutes = new Set(["/login", "/cadastro"]);
type AccessState = "loading" | "demo" | CurrentUserAccess | null;

function canShowNavItem(access: AccessState, permissions: readonly string[]) {
  if (access === "demo") return true;
  if (!access || access === "loading") return false;
  if (isCurrentUserMaster(access)) return true;
  return canAccessModule({ isMaster: false, permissions: access.permissions }, permissions);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [access, setAccess] = useState<AccessState>(() =>
    hasSupabaseBrowserEnv() ? "loading" : "demo",
  );

  useEffect(() => {
    if (publicRoutes.has(pathname)) return;

    let active = true;

    if (!hasSupabaseBrowserEnv()) {
      return;
    }

    getCurrentUserAccess()
      .then((currentAccess) => {
        if (active) setAccess(currentAccess);
      })
      .catch(() => {
        if (active) setAccess(null);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  if (publicRoutes.has(pathname)) {
    return <>{children}</>;
  }

  const visibleNavItems = navItems.filter((item) => {
    if (item.href === "/carteira" && access !== "demo") {
      if (!access || access === "loading") return false;
      if (!isCurrentUserMaster(access) && !(access.permissions["production.contracts.view"] && access.permissions["production.prods.view"])) return false;
    }
    return canShowNavItem(access, item.permissions);
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/10 bg-charcoal p-4 text-white shadow-2xl md:flex">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-md bg-accent text-base font-black text-accent-foreground">
            C21
          </span>
          <span>
            <span className="block text-sm font-semibold">Concept21 Aluminium</span>
            <span className="block text-xs text-white/55">Módulo de Produção</span>
          </span>
        </Link>

        <nav className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white",
                  active && "bg-white text-charcoal hover:bg-white hover:text-charcoal",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-md border border-white/10 bg-white/[0.04] p-4 text-xs text-white/65">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="size-4 text-accent" />
            Controle por PROD
          </div>
          <p className="mt-2 leading-5">
            Materiais, etapas, expedição e relatórios operacionais no mesmo fluxo.
          </p>
        </div>
      </aside>

      <div className="min-h-screen md:pl-72">
        <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-8 xl:px-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex min-w-0 items-center gap-3 md:hidden">
              <span className="flex size-10 flex-none items-center justify-center rounded-md bg-charcoal text-sm font-black text-white">
                C21
              </span>
              <span className="truncate text-sm font-semibold">Produção</span>
            </Link>

            <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
              <BriefcaseBusiness className="size-4 text-accent" />
              Plataforma interna Concept21 Aluminium
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <NotificationsBell />
              <CurrentUserMenu />
            </div>
          </div>

          <nav className="mt-3 flex gap-2 overflow-x-auto md:hidden">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground",
                    active && "border-charcoal bg-charcoal text-white",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
          <AuthGate>{children}</AuthGate>
        </main>
      </div>
    </div>
  );
}
