import { isOperationalProd } from "./lifecycle";
import type { DocumentCheck, ProdMaterial, ProductionSnapshot } from "./types";

export type PlanningWindow = "atrasada" | "hoje" | "proximos_7_dias" | "futura" | "sem_data" | "producao_concluida";
export type MaterialReadiness = "sem_registro" | "pendente" | "confirmado";

export type OpenProdPlan = {
  prodId: string;
  plannedDate: string | null;
  window: PlanningWindow;
  materials: MaterialReadiness;
  materialIssues: string[];
  documents: "sem_registro" | "pendente" | "conferidos";
  pendingDocuments: number;
};

export function todayInBrasilia(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function plusCalendarDays(day: string, days: number) {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date + days));
  return utc.toISOString().slice(0, 10);
}

export function planningWindow(date: string | null, today: string): PlanningWindow {
  if (!date) return "sem_data";
  const day = date.slice(0, 10);
  if (day < today) return "atrasada";
  if (day === today) return "hoje";
  if (day <= plusCalendarDays(today, 7)) return "proximos_7_dias";
  return "futura";
}

function materialReadiness(rows: ProdMaterial[]) {
  if (rows.length === 0) return { materials: "sem_registro" as const, materialIssues: [] };
  const materialIssues = rows
    .filter(row => row.confirmation_status !== "confirmado")
    .map(row => row.group);
  return {
    materials: materialIssues.length ? "pendente" as const : "confirmado" as const,
    materialIssues,
  };
}

function documentReadiness(rows: DocumentCheck[]) {
  const pendingDocuments = rows.filter(row => !row.checked).length;
  return {
    documents: rows.length === 0 ? "sem_registro" as const
      : pendingDocuments ? "pendente" as const : "conferidos" as const,
    pendingDocuments,
  };
}

export function getOpenProdPlans(snapshot: ProductionSnapshot, now: Date) {
  const today = todayInBrasilia(now);
  const materialsByProd = new Map<string, ProdMaterial[]>();
  const documentsByProd = new Map<string, DocumentCheck[]>();
  for (const row of snapshot.prodMaterials) {
    materialsByProd.set(row.prod_id, [...(materialsByProd.get(row.prod_id) ?? []), row]);
  }
  for (const row of snapshot.documentChecks) {
    documentsByProd.set(row.prod_id, [...(documentsByProd.get(row.prod_id) ?? []), row]);
  }
  const plans: Record<string, OpenProdPlan> = {};
  for (const prod of snapshot.prods) {
    if (!isOperationalProd(prod, snapshot.contracts)) continue;
    const materials = materialReadiness(materialsByProd.get(prod.id) ?? []);
    const documents = documentReadiness(documentsByProd.get(prod.id) ?? []);
    plans[prod.id] = {
      prodId: prod.id,
      plannedDate: prod.planned_end_date,
      window: prod.lifecycle?.manufacturing_state === "concluida"
        ? "producao_concluida" : planningWindow(prod.planned_end_date, today),
      ...materials,
      ...documents,
    };
  }
  return plans;
}

const windowOrder: Record<PlanningWindow, number> = {
  atrasada: 0, hoje: 1, proximos_7_dias: 2, sem_data: 3, futura: 4, producao_concluida: 5,
};

export function compareOpenProdPlans(a: OpenProdPlan, b: OpenProdPlan) {
  return windowOrder[a.window] - windowOrder[b.window]
    || (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "")
    || a.prodId.localeCompare(b.prodId);
}
