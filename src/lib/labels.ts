import type {
  ExtraServiceStatus,
  FreightStatus,
  LabelMap,
  MaterialConfirmationStatus,
  MaterialForecastStatus,
  Priority,
  ProdStatus,
  ReworkStatus,
  RouteExecutionType,
  StageStatus,
  StopType,
} from "./types";

export const prodStatusLabels: LabelMap<ProdStatus> = {
  planejamento: "Planejamento",
  aguardando_materiais: "Aguardando materiais",
  aguardando_listas: "Aguardando listas",
  pronta_para_producao: "Pronta para produção",
  em_producao: "Em produção",
  pausada: "Pausada",
  embalagem: "Embalagem",
  expedicao: "Expedição",
  aguardando_frete: "Aguardando frete",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const stageStatusLabels: LabelMap<StageStatus> = {
  nao_iniciada: "Não iniciada",
  aguardando: "Aguardando",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  concluida_parcialmente: "Concluída parcialmente",
  pausada: "Pausada",
  com_pendencia: "Com pendência",
  nao_aplicavel: "Não aplicável",
};

export const materialForecastLabels: LabelMap<MaterialForecastStatus> = {
  nao_informado: "Não informado",
  em_levantamento: "Em levantamento",
  previsto: "Previsto",
  parcialmente_previsto: "Parcialmente previsto",
  sem_previsao: "Sem previsão",
};

export const materialConfirmationLabels: LabelMap<MaterialConfirmationStatus> =
  {
    nao_verificado: "Não verificado",
    aguardando_confirmacao: "Aguardando confirmação",
    parcialmente_confirmado: "Parcialmente confirmado",
    confirmado: "Confirmado",
    indisponivel: "Indisponível",
  };

export const freightStatusLabels: LabelMap<FreightStatus> = {
  previsto: "Previsto",
  em_planejamento: "Em planejamento",
  pre_agendado: "Pré-agendado",
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_carregamento: "Em carregamento",
  em_transito: "Em trânsito",
  concluido: "Concluído",
  parcialmente_concluido: "Parcialmente concluído",
  nao_realizado: "Não realizado",
  cancelado: "Cancelado",
};

export const stopTypeLabels: LabelMap<StopType> = {
  entrega_prod: "Entrega de PROD",
  entrega_avulsa: "Entrega avulsa",
  coleta_avulsa: "Coleta avulsa",
  entrega_coleta_avulsa: "Entrega e coleta avulsa",
};

export const extraServiceStatusLabels: LabelMap<ExtraServiceStatus> = {
  previsto: "Previsto",
  em_planejamento: "Em planejamento",
  solicitado: "Solicitado",
  aguardando_inclusao_rota: "Aguardando inclusão em rota",
  incluido_em_rota: "Incluído em rota",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  nao_realizado: "Não realizado",
  cancelado: "Cancelado",
};

export const priorityLabels: LabelMap<Priority> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const reworkStatusLabels: LabelMap<ReworkStatus> = {
  registrado: "Registrado",
  em_analise_tecnica: "Em análise técnica",
  aguardando_material: "Aguardando material",
  liberado_para_producao: "Liberado para produção",
  em_retrabalho: "Em retrabalho",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const routeExecutionTypeLabels: LabelMap<RouteExecutionType> = {
  terceirizado: "Terceirizado",
  veiculo_proprio: "Veículo próprio",
};

export const stageShortLabels: Record<string, string> = {
  "Identificacao e previsao de materiais": "Previsão de materiais",
  "Confirmacao de materiais": "Confirmação de materiais",
  "Recebimento das listas e ordens de producao": "Recebimento das listas",
  "Separacao do material para corte": "Separação",
  "Preparacao e montagem": "Preparação e montagem",
  Expedicao: "Expedição",
  "Identificação e previsão de materiais": "Previsão de materiais",
  "Confirmação de materiais": "Confirmação de materiais",
  "Recebimento das listas e ordens de produção": "Recebimento das listas",
  "Separação do material para corte": "Separação",
  Corte: "Corte",
  Usinagem: "Usinagem",
  "Preparação e montagem": "Preparação e montagem",
  Embalagem: "Embalagem",
  Expedição: "Expedição",
  Frete: "Frete",
};
