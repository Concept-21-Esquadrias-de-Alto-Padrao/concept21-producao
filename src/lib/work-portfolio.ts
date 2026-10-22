import { lifecycleView } from "./lifecycle";
import type { ProductionContract, ProductionProd, ProductionSnapshot } from "./types";

export type WorkPortfolioRow = {
  contract: ProductionContract;
  clientName: string;
  prods: ProductionProd[];
  pieceLines: number;
  pieceUnits: number;
  releasedLines: number;
  materialState: "indisponivel" | "sem_prod" | "nao_verificado" | "pendente" | "confirmado";
  progress: "sem_prod" | "sem_itens" | "em_planejamento" | "em_producao" | "concluido";
};

export function buildWorkPortfolio(snapshot: ProductionSnapshot, canSeeMaterials: boolean): WorkPortfolioRow[] {
  const clientNames = new Map(snapshot.clients.map(client => [client.id, client.name]));
  const prodsByContract = new Map<string, ProductionProd[]>();
  const piecesByProd = new Map<string, typeof snapshot.prodPieces>();
  const materialsByProd = new Map<string, typeof snapshot.prodMaterials>();
  for (const prod of snapshot.prods) {
    const list = prodsByContract.get(prod.contract_id) ?? [];
    list.push(prod);
    prodsByContract.set(prod.contract_id, list);
  }
  for (const piece of snapshot.prodPieces) {
    const list = piecesByProd.get(piece.prod_id) ?? [];
    list.push(piece);
    piecesByProd.set(piece.prod_id, list);
  }
  for (const material of snapshot.prodMaterials) {
    const list = materialsByProd.get(material.prod_id) ?? [];
    list.push(material);
    materialsByProd.set(material.prod_id, list);
  }

  return snapshot.contracts.map(contract => {
    const prods = prodsByContract.get(contract.id) ?? [];
    const pieces = prods.flatMap(prod => piecesByProd.get(prod.id) ?? []);
    const materials = prods.flatMap(prod => materialsByProd.get(prod.id) ?? []);
    const activePieces = pieces.filter(piece => !piece.disposition?.cancelled_at);
    let materialState: WorkPortfolioRow["materialState"] = "indisponivel";
    if (canSeeMaterials) {
      materialState = !prods.length ? "sem_prod"
        : !materials.length || materials.some(material => material.confirmation_status === "nao_verificado")
          ? "nao_verificado"
          : materials.every(material => material.confirmation_status === "confirmado")
            ? "confirmado" : "pendente";
    }

    const progress: WorkPortfolioRow["progress"] = !prods.length ? "sem_prod"
      : prods.every(prod => lifecycleView(prod) === "concluidos") ? "concluido"
        : !pieces.length ? "sem_itens"
          : prods.some(prod => ["em_producao", "embalagem", "expedicao"].includes(prod.status))
            ? "em_producao" : "em_planejamento";

    return {
      contract,
      clientName: clientNames.get(contract.client_id) ?? "Cliente não identificado",
      prods,
      pieceLines: activePieces.length,
      pieceUnits: activePieces.reduce((sum, piece) => sum + Number(piece.quantity || 0), 0),
      releasedLines: activePieces.filter(piece => piece.released_to_production).length,
      materialState,
      progress,
    };
  });
}

export const workProgressLabels: Record<WorkPortfolioRow["progress"], string> = {
  sem_prod: "Sem PROD cadastrada",
  sem_itens: "PROD sem itens cadastrados",
  em_planejamento: "PRODs em planejamento",
  em_producao: "PRODs em execução",
  concluido: "PRODs concluídas",
};

export const materialStateLabels: Record<WorkPortfolioRow["materialState"], string> = {
  indisponivel: "Sem acesso à conferência de materiais",
  sem_prod: "Sem PROD cadastrada",
  nao_verificado: "Não verificado",
  pendente: "Confirmação pendente ou parcial",
  confirmado: "Confirmado nas PRODs atuais",
};

export function planningDeadline(date: string | null, today: string): "sem_data" | "vencido" | "proximos_30" | "futuro" {
  if (!date) return "sem_data";
  if (date < today) return "vencido";
  const deadline = new Date(`${date}T12:00:00Z`).getTime();
  const current = new Date(`${today}T12:00:00Z`).getTime();
  return deadline - current <= 30 * 86400000 ? "proximos_30" : "futuro";
}
