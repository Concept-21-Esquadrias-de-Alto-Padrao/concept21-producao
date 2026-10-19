export const PROD_STATUSES = [
  "planejamento",
  "aguardando_materiais",
  "aguardando_listas",
  "pronta_para_producao",
  "em_producao",
  "pausada",
  "embalagem",
  "expedicao",
  "aguardando_frete",
  "concluida",
  "cancelada",
] as const;

export const STAGE_STATUSES = [
  "nao_iniciada",
  "aguardando",
  "em_andamento",
  "concluida",
  "concluida_parcialmente",
  "pausada",
  "com_pendencia",
  "nao_aplicavel",
] as const;

export const POINTING_ACTIONS = [
  "iniciar",
  "pausar",
  "retomar",
  "concluir",
  "pendencia",
  "nao_aplicavel",
  "retornar",
  "ajuste_tempo",
] as const;

export const POINTING_REASON_KINDS = ["pausa", "pendencia"] as const;
export const REWORK_REASON_KINDS = ["motivo", "origem"] as const;
export const REWORK_STATUSES = [
  "registrado",
  "em_analise_tecnica",
  "aguardando_material",
  "liberado_para_producao",
  "em_retrabalho",
  "concluido",
  "cancelado",
] as const;

export const MATERIAL_GROUPS = ["perfis", "componentes", "vidros"] as const;

export const MATERIAL_FORECAST_STATUSES = [
  "nao_informado",
  "em_levantamento",
  "previsto",
  "parcialmente_previsto",
  "sem_previsao",
] as const;

export const MATERIAL_CONFIRMATION_STATUSES = [
  "nao_verificado",
  "aguardando_confirmacao",
  "parcialmente_confirmado",
  "confirmado",
  "indisponivel",
] as const;

export const FREIGHT_STATUSES = [
  "previsto",
  "em_planejamento",
  "pre_agendado",
  "agendado",
  "confirmado",
  "em_carregamento",
  "em_transito",
  "concluido",
  "parcialmente_concluido",
  "nao_realizado",
  "cancelado",
] as const;

export const STOP_TYPES = [
  "entrega_prod",
  "entrega_avulsa",
  "coleta_avulsa",
  "entrega_coleta_avulsa",
] as const;

export const EXTRA_SERVICE_STATUSES = [
  "previsto",
  "em_planejamento",
  "solicitado",
  "aguardando_inclusao_rota",
  "incluido_em_rota",
  "em_andamento",
  "concluido",
  "nao_realizado",
  "cancelado",
] as const;

export const PRIORITIES = ["baixa", "normal", "alta", "urgente"] as const;
export const ROUTE_EXECUTION_TYPES = ["terceirizado", "veiculo_proprio"] as const;
export const LOGISTICS_VEHICLE_KINDS = ["veiculo", "carretinha"] as const;

export type ProdStatus = (typeof PROD_STATUSES)[number];
export type StageStatus = (typeof STAGE_STATUSES)[number];
export type PointingAction = (typeof POINTING_ACTIONS)[number];
export type PointingReasonKind = (typeof POINTING_REASON_KINDS)[number];
export type ReworkReasonKind = (typeof REWORK_REASON_KINDS)[number];
export type ReworkStatus = (typeof REWORK_STATUSES)[number];
export type MaterialGroup = (typeof MATERIAL_GROUPS)[number];
export type MaterialForecastStatus =
  (typeof MATERIAL_FORECAST_STATUSES)[number];
export type MaterialConfirmationStatus =
  (typeof MATERIAL_CONFIRMATION_STATUSES)[number];
export type FreightStatus = (typeof FREIGHT_STATUSES)[number];
export type StopType = (typeof STOP_TYPES)[number];
export type ExtraServiceStatus = (typeof EXTRA_SERVICE_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type RouteExecutionType = (typeof ROUTE_EXECUTION_TYPES)[number];
export type LogisticsVehicleKind = (typeof LOGISTICS_VEHICLE_KINDS)[number];

export type LabelMap<T extends string> = Record<T, string>;

export type Department = {
  id: string;
  name: string;
  active: boolean;
};

export type LogisticsRecipient = {
  id: string;
  name: string;
  address: string;
  active: boolean;
};

export type LogisticsDriver = {
  id: string;
  name: string;
  hourly_cost: number;
  can_drive: boolean;
  can_help: boolean;
  active: boolean;
};

export type LogisticsVehicle = {
  id: string;
  name: string;
  plate: string;
  vehicle_kind: LogisticsVehicleKind;
  ownership_type: "proprio" | "terceiro";
  fuel_consumption_km_l: number;
  wear_cost_per_km: number;
  active: boolean;
};

export type LogisticsSettings = {
  company_id: string;
  fuel_price_per_liter: number;
  updated_at: string;
};

export type ExtraServiceCatalog = {
  id: string;
  name: string;
  description: string;
  active: boolean;
};

export type Profile = {
  id: string;
  company_id: string;
  user_id: string | null;
  name: string;
  email: string;
  title: string | null;
  department_id: string | null;
  status: "active" | "inactive";
  avatar_url: string | null;
  is_master: boolean;
  permissions: string[];
};

export type Role = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_master_role: boolean;
  active: boolean;
};

export type Permission = {
  id: string;
  key: string;
  description: string;
};

export type RolePermission = {
  id: string;
  company_id: string;
  role_id: string;
  permission_id: string;
};

export type UserRole = {
  id: string;
  company_id: string;
  profile_id: string;
  role_id: string;
  active?: boolean;
  role?: Role | null;
};

export type AccessReviewRequest = {
  id: string;
  company_id: string;
  profile_id: string;
  auth_user_id: string;
  email: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  email_confirmed_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewer_notes: string | null;
  metadata?: Record<string, unknown>;
};

export type PlatformNotification = {
  id: string;
  recipient_profile_id: string | null;
  recipient_auth_user_id: string | null;
  title: string;
  body: string;
  category: string;
  entity: string | null;
  entity_id: string | null;
  action_url: string | null;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SystemMaintenance = {
  company_id: string;
  enabled: boolean;
  message: string;
  activated_at: string | null;
  activated_by: string | null;
  deactivated_at: string | null;
  deactivated_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type Client = {
  id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
};

export type ProductionContract = {
  id: string;
  contract_number: string;
  client_id: string;
  work_name: string;
  full_address: string;
  street: string | null;
  block: string | null;
  lot: string | null;
  sector: string | null;
  city: string;
  state: string;
  zip_code: string | null;
  site_contact: string | null;
  site_contact_phone: string | null;
  general_delivery_forecast: string | null;
  notes: string | null;
  status: string;
  active: boolean;
};

export type ProductionStage = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  icon: string | null;
  required_permission: string | null;
};

export type ProductionProd = {
  id: string;
  contract_id: string;
  prod_number: number;
  description: string | null;
  owner_profile_id: string | null;
  priority: Priority;
  planned_start_date: string | null;
  planned_end_date: string | null;
  delivery_forecast: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  current_stage_id: string | null;
  status: ProdStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pieces_count: number;
  pieces_area_m2: number;
  pieces_weight_kg: number;
  external_source?: string | null;
  external_id?: string | null;
  integration_metadata?: Record<string, unknown> | null;
};

export type ProdStage = {
  id: string;
  prod_id: string;
  stage_id: string;
  status: StageStatus;
  owner_profile_id: string | null;
  planned_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  blockers: string | null;
  last_updated_by: string | null;
  last_updated_at: string;
};

export type ProdMaterial = {
  id: string;
  prod_id: string;
  group: MaterialGroup;
  forecast_status: MaterialForecastStatus;
  availability_forecast: string | null;
  confirmation_status: MaterialConfirmationStatus;
  confirmed_at: string | null;
  confirmed_by: string | null;
  notes: string | null;
  location: string | null;
  blockers: string | null;
};

export type StorageLocation = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  material_group: MaterialGroup | null;
  description: string | null;
  active: boolean;
};

export type DocumentCheck = {
  id: string;
  prod_id: string;
  label: string;
  checked: boolean;
  checked_at: string | null;
  responsible_profile_id: string | null;
  notes: string | null;
  attachment_path: string | null;
};

export type SelectedItem = {
  id: string;
  prod_id: string;
  stage_id: string | null;
  item_name: string;
  selected: boolean;
  quantity: number | null;
  location: string | null;
  withdrawn: boolean;
  packed: boolean;
  responsible_profile_id: string | null;
  event_date: string | null;
  notes: string | null;
};

export type ShippingRecord = {
  id: string;
  prod_id: string;
  shipping_location: string | null;
  entered_at: string | null;
  planned_departure: string | null;
  actual_departure: string | null;
  responsible_profile_id: string | null;
  status: string;
  notes: string | null;
};

export type ProductionPieceImport = {
  id: string;
  company_id: string;
  prod_id: string;
  file_name: string;
  parsed_totals: Record<string, unknown>;
  source: string;
  created_by: string | null;
  created_at: string;
};

export type ProductionPiece = {
  id: string;
  company_id: string;
  prod_id: string;
  piece_code: string;
  system_code: string | null;
  system_description: string | null;
  quantity: number;
  width_mm: number | null;
  height_mm: number | null;
  measure_a: number | null;
  measure_b: number | null;
  location: string | null;
  area_m2: number;
  unit_weight_kg: number;
  total_weight_kg: number;
  source: string;
  import_batch_id: string | null;
  released_to_production: boolean;
  released_at: string | null;
  released_by: string | null;
  sort_order: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionPieceStage = {
  expedition_archive?: import("./expedition-archive").ExpeditionArchive | import("./expedition-archive").ExpeditionArchive[] | null;
  id: string;
  company_id: string;
  prod_id: string;
  piece_id: string;
  stage_id: string;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  total_productive_seconds: number;
  total_paused_seconds: number;
  current_operator_id: string | null;
  last_action: PointingAction | null;
  last_action_at: string | null;
  load_volume_count: number;
  load_checklist: Record<string, LoadControlCheckValue>;
  load_checked_at: string | null;
  load_checked_by: string | null;
  active_rework_id: string | null;
  notes: string | null;
  blockers: string | null;
  created_at: string;
  updated_at: string;
};

export type LoadControlCheckValue = {
  checked?: boolean;
  notes?: string | null;
};

export type ProductionOperator = {
  id: string;
  company_id: string;
  name: string;
  registration: string;
  active: boolean;
  notes: string | null;
  stage_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionOperatorStage = {
  id: string;
  company_id: string;
  operator_id: string;
  stage_id: string;
  created_at: string;
};

export type ProductionPointingReason = {
  id: string;
  company_id: string;
  kind: PointingReasonKind;
  label: string;
  description: string | null;
  active: boolean;
  counts_as_downtime: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionIndirectActivityReason = {
  id: string;
  company_id: string;
  label: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionIndirectActivitySession = {
  id: string;
  company_id: string;
  operator_id: string;
  reason_id: string | null;
  session_profile_id: string | null;
  auth_user_id: string | null;
  status: "em_andamento" | "concluida" | "cancelada";
  started_at: string;
  ended_at: string | null;
  total_seconds: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionPointingBreak = {
  label: string;
  start: string;
  end: string;
};

export type ProductionPointingSettings = {
  company_id: string;
  timezone: string;
  workday_start: string;
  workday_end: string;
  workdays: number[];
  breaks: ProductionPointingBreak[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionPointingSessionParticipant = {
  id: string;
  company_id: string;
  pointing_session_id: string;
  operator_id: string;
  created_at: string;
};

export type ProductionReworkReason = {
  id: string;
  company_id: string;
  kind: ReworkReasonKind;
  label: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionPieceRework = {
  id: string;
  company_id: string;
  prod_id: string;
  piece_id: string;
  reason_id: string | null;
  origin_id: string | null;
  target_stage_id: string | null;
  status: ReworkStatus;
  priority: Priority;
  returned_at: string;
  needs_technical_info: boolean;
  needs_material_purchase: boolean;
  technical_guidance: string | null;
  material_notes: string | null;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionStageTimeEntry = {
  id: string;
  company_id: string;
  pointing_session_id: string | null;
  pointing_reason_id: string | null;
  rework_id: string | null;
  prod_id: string;
  piece_id: string;
  stage_id: string;
  piece_stage_id: string;
  operator_id: string;
  session_profile_id: string | null;
  auth_user_id: string | null;
  action: PointingAction;
  event_at: string;
  productive_seconds_delta: number;
  paused_seconds_delta: number;
  notes: string | null;
  pause_reason: string | null;
  created_at: string;
};

export type ProductionPointingSession = {
  id: string;
  company_id: string;
  prod_ids: string[];
  stage_id: string;
  operator_id: string;
  pointing_reason_id: string | null;
  rework_id: string | null;
  session_profile_id: string | null;
  auth_user_id: string | null;
  action: PointingAction;
  event_at: string;
  productive_seconds_delta: number;
  paused_seconds_delta: number;
  piece_count: number;
  notes: string | null;
  pause_reason: string | null;
  created_at: string;
};

export type Freight = {
  id: string;
  title: string;
  freight_date: string;
  planned_departure_time: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  trailer_vehicle_id?: string | null;
  driver: string | null;
  vehicle: string | null;
  plate: string | null;
  trailer: string | null;
  trailer_plate: string | null;
  status: FreightStatus;
  expected_value: number;
  contracted_value: number;
  realized_value: number;
  additional_costs: number;
  execution_type: RouteExecutionType;
  distance_km: number;
  estimated_hours: number;
  helper_hours: number;
  fuel_cost: number;
  driver_labor_cost: number;
  helper_labor_cost: number;
  vehicle_wear_cost: number;
  trailer_wear_cost: number;
  internal_total_cost: number;
  driver_hourly_cost_snapshot: number;
  vehicle_consumption_snapshot: number;
  fuel_price_snapshot: number;
  wear_cost_snapshot: number;
  trailer_wear_cost_snapshot: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FreightRouteHelper = {
  id: string;
  freight_id: string;
  helper_id: string | null;
  helper_name: string;
  hourly_cost_snapshot: number;
  hours: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
};

export type FreightStop = {
  id: string;
  freight_id: string;
  freight_demand_id?: string | null;
  position: number;
  stop_type: StopType;
  requesting_department_id: string;
  requesting_profile_id: string | null;
  title: string;
  address: string;
  contact: string | null;
  phone: string | null;
  planned_window: string | null;
  notes: string | null;
  status: string;
  requires_proof: boolean;
  completed: boolean;
  prod_ids: string[];
  extra_service_request_id: string | null;
};

export type FreightDemand = {
  id: string;
  prod_id: string;
  contract_id: string;
  client_id: string;
  planned_date: string | null;
  status: "previsto" | "em_planejamento" | "incluido_em_rota" | "concluido" | "nao_realizado" | "cancelado";
  created_at: string;
  updated_at: string;
};

export type ExtraServiceRequest = {
  id: string;
  service_type: Exclude<StopType, "entrega_prod">;
  requesting_department_id: string;
  requesting_profile_id: string | null;
  recipient_id?: string | null;
  service_catalog_id?: string | null;
  recipient_or_place: string;
  address: string;
  contact: string | null;
  phone: string | null;
  service_description: string;
  materials_description: string | null;
  desired_date: string | null;
  desired_window: string | null;
  priority: Priority;
  notes: string | null;
  requires_proof: boolean;
  status: ExtraServiceStatus;
  client_id: string | null;
  contract_id: string | null;
  prod_id: string | null;
};

export type AuditLog = {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  user_id: string | null;
  created_at: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  notes: string | null;
};

export type ProductionSnapshot = {
  departments: Department[];
  logisticsRecipients: LogisticsRecipient[];
  logisticsDrivers: LogisticsDriver[];
  logisticsVehicles: LogisticsVehicle[];
  logisticsSettings: LogisticsSettings | null;
  extraServiceCatalog: ExtraServiceCatalog[];
  profiles: Profile[];
  clients: Client[];
  contracts: ProductionContract[];
  stages: ProductionStage[];
  prods: ProductionProd[];
  prodStages: ProdStage[];
  prodMaterials: ProdMaterial[];
  prodPieceImports: ProductionPieceImport[];
  prodPieces: ProductionPiece[];
  prodPieceStages: ProductionPieceStage[];
  productionOperators: ProductionOperator[];
  productionOperatorStages: ProductionOperatorStage[];
  pointingReasons: ProductionPointingReason[];
  pointingSettings: ProductionPointingSettings | null;
  indirectActivityReasons: ProductionIndirectActivityReason[];
  indirectActivitySessions: ProductionIndirectActivitySession[];
  pointingSessionParticipants: ProductionPointingSessionParticipant[];
  reworkReasons: ProductionReworkReason[];
  pieceReworks: ProductionPieceRework[];
  pointingSessions: ProductionPointingSession[];
  stageTimeEntries: ProductionStageTimeEntry[];
  storageLocations: StorageLocation[];
  documentChecks: DocumentCheck[];
  selectedItems: SelectedItem[];
  shippingRecords: ShippingRecord[];
  freightDemands: FreightDemand[];
  freights: Freight[];
  freightStops: FreightStop[];
  freightRouteHelpers: FreightRouteHelper[];
  extraServices: ExtraServiceRequest[];
  auditLogs: AuditLog[];
  source: "supabase" | "demo";
};
