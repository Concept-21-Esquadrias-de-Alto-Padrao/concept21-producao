export const MODULE_ACCESS = {
  dashboard: ["production.dashboard.view"],
  clients: ["production.clients.view"],
  contracts: ["production.contracts.view"],
  prods: ["production.prods.view"],
  pointing: ["production.pointing.view"],
  transport: [
    "production.transport.view",
    "production.freights.view",
    "production.freights.create",
    "production.freights.edit",
    "production.routes.view",
    "production.routes.create",
    "production.routes.edit",
    "production.extra_services.view",
    "production.extra_services.create",
    "production.extra_services.edit",
  ],
  reports: ["production.reports.view"],
  settings: [
    "production.settings.manage_departments",
    "production.settings.manage_locations",
    "production.settings.manage_selectable_items",
    "production.settings.manage_stages",
    "production.settings.manage_logistics",
    "production.settings.manage_users",
    "production.permissions.manage",
    "production.pointing.manage_operators",
    "production.pointing.manage_reasons",
    "production.rework.manage",
    "production.transport.manage_costs",
  ],
} as const;

export const SETTINGS_TAB_ACCESS = {
  registries: [
    "production.settings.manage_departments",
    "production.settings.manage_locations",
    "production.settings.manage_selectable_items",
  ],
  logistics: [
    "production.settings.manage_logistics",
    "production.transport.manage_costs",
  ],
  stages: ["production.settings.manage_stages"],
  pointing: [
    "production.pointing.manage_operators",
    "production.pointing.manage_reasons",
    "production.rework.manage",
  ],
  security: ["production.settings.manage_users", "production.permissions.manage"],
  system: ["production.permissions.manage"],
} as const;

export type PermissionLookup = {
  isMaster: boolean;
  permissions: Record<string, boolean>;
};

export type SettingsTabId = keyof typeof SETTINGS_TAB_ACCESS;

export const appNavigationPermissionKeys = Array.from(
  new Set(Object.values(MODULE_ACCESS).flat()),
);

export const settingsPermissionKeys = Array.from(
  new Set(Object.values(SETTINGS_TAB_ACCESS).flat()),
);

export const appRouteAccess = [
  { href: "/", permissions: MODULE_ACCESS.dashboard },
  { href: "/clients", permissions: MODULE_ACCESS.clients },
  { href: "/contracts", permissions: MODULE_ACCESS.contracts },
  { href: "/prods", permissions: MODULE_ACCESS.prods },
  { href: "/pointing", permissions: MODULE_ACCESS.pointing },
  { href: "/transport", permissions: MODULE_ACCESS.transport },
  { href: "/reports", permissions: MODULE_ACCESS.reports },
  { href: "/settings", permissions: MODULE_ACCESS.settings },
] as const;

export function hasAnyPermission(
  permissions: Record<string, boolean>,
  permissionKeys: readonly string[],
) {
  return permissionKeys.some((permissionKey) => permissions[permissionKey]);
}

export function canAccessModule(
  access: PermissionLookup,
  permissionKeys: readonly string[],
) {
  return access.isMaster || hasAnyPermission(access.permissions, permissionKeys);
}

export function firstAllowedAppRoute(access: PermissionLookup) {
  return (
    appRouteAccess.find((route) => canAccessModule(access, route.permissions))?.href ?? null
  );
}

export function getAllowedSettingsTabIds(access: PermissionLookup): SettingsTabId[] {
  return (Object.keys(SETTINGS_TAB_ACCESS) as SettingsTabId[]).filter((tabId) =>
    canAccessModule(access, SETTINGS_TAB_ACCESS[tabId]),
  );
}
