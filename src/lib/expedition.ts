import type {
  Client,
  ProductionContract,
  ProductionPiece,
  ProductionPieceStage,
  ProductionProd,
} from "./types";
import { accentDisplayText, formatDateTime } from "./utils";

export const LOAD_CONTROL_ITEMS = [
  { key: "vidros", label: "Vidros" },
  { key: "marcos", label: "Marcos" },
  { key: "folhas", label: "Folhas" },
  { key: "acessorios", label: "Acessórios (torres, bottons)" },
  { key: "esperas_aco", label: "Esperas de aço" },
  { key: "arremates", label: "Arremates" },
  { key: "pecas_avulsas", label: "Peças avulsas (tubos e etc.)" },
  { key: "carrinho_transporte", label: "Carrinho de transporte" },
  { key: "presilhas", label: "Presilhas" },
  { key: "esteiras_persiana", label: "Esteiras de persiana (palhetas)" },
] as const;

export type LoadControlItemKey = (typeof LOAD_CONTROL_ITEMS)[number]["key"];

export type ExpeditionRomaneioRow = {
  index: number;
  pieceCode: string;
  quantity: number;
  description: string;
  dimensions: string;
  observations: string;
  location: string;
  volumes: number;
};

export type ExpeditionRomaneioReport = {
  title: string;
  romaneioNumber?: string;
  generatedAt: string;
  client: string;
  contractNumber: string;
  prodNumber: string;
  workName: string;
  address: string;
  cityState: string;
  phone: string;
  contact: string;
  color: string;
  rows: ExpeditionRomaneioRow[];
  totalItems: number;
  totalVolumes: number;
};

function compact(values: Array<string | null | undefined>) {
  return values
    .map((value) => accentDisplayText(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function contractAddress(contract: ProductionContract) {
  return (
    accentDisplayText(contract.full_address ?? "").trim() ||
    compact([
      contract.street,
      contract.block ? `Quadra ${contract.block}` : null,
      contract.lot ? `Lote ${contract.lot}` : null,
      contract.sector ? `Setor ${contract.sector}` : null,
    ]) ||
    "Endereço não informado"
  );
}

export function pieceDimensions(piece: ProductionPiece) {
  const width = piece.width_mm == null ? "" : String(piece.width_mm);
  const height = piece.height_mm == null ? "" : String(piece.height_mm);
  return width && height ? `${width} x ${height}` : "-";
}

export function loadControlObservation(pieceStage: ProductionPieceStage) {
  const values = Object.entries(pieceStage.load_checklist ?? {})
    .filter(([, value]) => value?.checked && accentDisplayText(value.notes ?? "").trim())
    .map(([key, value]) => {
      const item = LOAD_CONTROL_ITEMS.find((candidate) => candidate.key === key);
      return `${item?.label ?? key}: ${accentDisplayText(value.notes ?? "").trim()}`;
    });

  return values.join("; ");
}

export function buildExpeditionRomaneioReport({
  client,
  contract,
  prod,
  pieces,
  pieceStages,
  generatedAt = new Date().toISOString(),
}: {
  client: Client;
  contract: ProductionContract;
  prod: ProductionProd;
  pieces: ProductionPiece[];
  pieceStages: ProductionPieceStage[];
  generatedAt?: string;
}): ExpeditionRomaneioReport {
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const rows = pieceStages
    .filter((pieceStage) => Number(pieceStage.load_volume_count ?? 0) > 0)
    .map((pieceStage) => ({ pieceStage, piece: pieceById.get(pieceStage.piece_id) }))
    .filter((entry): entry is { pieceStage: ProductionPieceStage; piece: ProductionPiece } =>
      Boolean(entry.piece),
    )
    .sort((left, right) => {
      const leftOrder = left.piece.sort_order ?? 0;
      const rightOrder = right.piece.sort_order ?? 0;
      return leftOrder - rightOrder || left.piece.piece_code.localeCompare(right.piece.piece_code);
    })
    .map(({ pieceStage, piece }, index) => ({
      index: index + 1,
      pieceCode: accentDisplayText(piece.piece_code),
      quantity: Number(piece.quantity ?? 1),
      description:
        accentDisplayText(piece.system_description ?? "").trim() ||
        accentDisplayText(piece.system_code ?? "").trim() ||
        "Descrição não informada",
      dimensions: pieceDimensions(piece),
      observations: loadControlObservation(pieceStage),
      location: accentDisplayText(piece.location ?? "").trim() || "Não informado",
      volumes: Number(pieceStage.load_volume_count ?? 0),
    }));

  return {
    title: "Romaneio de entrega",
    generatedAt: formatDateTime(generatedAt),
    client: accentDisplayText(client.name),
    contractNumber: accentDisplayText(contract.contract_number),
    prodNumber: String(prod.prod_number),
    workName: accentDisplayText(contract.work_name),
    address: contractAddress(contract),
    cityState: compact([contract.city, contract.state]) || "Não informado",
    phone: accentDisplayText(client.phone ?? "").trim() || "Não informado",
    contact: accentDisplayText(contract.site_contact ?? "").trim() || "Não informado",
    color: "Não informado",
    rows,
    totalItems: rows.reduce((sum, row) => sum + row.quantity, 0),
    totalVolumes: rows.reduce((sum, row) => sum + row.volumes, 0),
  };
}
