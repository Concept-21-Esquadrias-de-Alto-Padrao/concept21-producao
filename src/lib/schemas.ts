import { z } from "zod";
import { isBrazilianStateCode } from "./brazil-locations";
import {
  EXTRA_SERVICE_STATUSES,
  MATERIAL_CONFIRMATION_STATUSES,
  MATERIAL_FORECAST_STATUSES,
  PRIORITIES,
  PROD_STATUSES,
  ROUTE_EXECUTION_TYPES,
  STAGE_STATUSES,
  STOP_TYPES,
} from "./types";

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const money = z.coerce.number().min(0, "Valores não podem ser negativos").default(0);
const requiredAddressPart = (message: string) => z.string().trim().min(1, message);
const optionalQuantity = z
  .preprocess((value) => (value === "" ? null : value), z.coerce.number().min(0).nullable())
  .optional();
const optionalUuid = z
  .preprocess((value) => {
    if (value === "" || value === undefined) return null;
    return value;
  }, z.string().uuid().nullable())
  .optional();

export const ROUTE_STATUSES = [
  "pre_agendado",
  "agendado",
  "concluido",
  "nao_realizado",
  "cancelado",
] as const;

export const clientSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo do cliente"),
  notes: optionalText,
  active: z.coerce.boolean().default(true),
});

export const clientUpdateSchema = z.object({
  id: z.string().uuid("Cliente inválido"),
  name: z.string().trim().min(2, "Informe o nome completo do cliente"),
  notes: optionalText,
});

const contractBaseSchema = z.object({
  contract_number: z.string().trim().min(1, "Informe o número do contrato"),
  client_id: z.string().uuid("Selecione um cliente"),
  work_name: z.string().trim().min(2, "Informe a obra"),
  street: requiredAddressPart("Informe a rua"),
  block: requiredAddressPart("Informe a quadra"),
  lot: requiredAddressPart("Informe o lote"),
  sector: requiredAddressPart("Informe o setor"),
  city: z.string().trim().min(2, "Selecione a cidade"),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isBrazilianStateCode, "Selecione um estado válido"),
  general_delivery_forecast: optionalText,
  notes: optionalText,
  status: z.string().trim().min(1).default("ativo"),
  active: z.coerce.boolean().default(true),
});

function normalizeContractAddress<T extends z.infer<typeof contractBaseSchema>>(data: T) {
  return {
    ...data,
    full_address: `Rua ${data.street}, Quadra ${data.block}, Lote ${data.lot}, Setor ${data.sector}`,
    zip_code: null,
    site_contact: null,
    site_contact_phone: null,
  };
}

export const contractSchema = contractBaseSchema.transform(normalizeContractAddress);

export const contractUpdateSchema = contractBaseSchema
  .extend({
    id: z.string().uuid("Contrato inválido"),
  })
  .transform(normalizeContractAddress);

export const prodSchema = z.object({
  contract_id: z.string().uuid("Contrato obrigatório"),
  prod_number: z.coerce.number().int().positive("Número da PROD obrigatório"),
  description: optionalText,
  owner_profile_id: optionalUuid,
  priority: z.enum(PRIORITIES).default("normal"),
  planned_start_date: optionalText,
  planned_end_date: optionalText,
  delivery_forecast: optionalText,
  actual_start_date: optionalText,
  actual_end_date: optionalText,
  current_stage_id: optionalUuid,
  status: z.enum(PROD_STATUSES).default("planejamento"),
  notes: optionalText,
  external_source: optionalText,
  external_id: optionalText,
});

export const prodUpdateSchema = prodSchema.extend({
  id: z.string().uuid("PROD inválida"),
});

export const prodStageUpdateSchema = z.object({
  id: z.string().uuid("Etapa inválida"),
  status: z.enum(STAGE_STATUSES),
  owner_profile_id: optionalUuid,
  planned_date: optionalText,
  notes: optionalText,
  blockers: optionalText,
});

export const prodMaterialUpdateSchema = z.object({
  id: z.string().uuid("Material inválido"),
  forecast_status: z.enum(MATERIAL_FORECAST_STATUSES),
  availability_forecast: optionalText,
  confirmation_status: z.enum(MATERIAL_CONFIRMATION_STATUSES),
  location: optionalText,
  notes: optionalText,
  blockers: optionalText,
});

export const prodDocumentCheckUpdateSchema = z.object({
  id: z.string().uuid("Documento inválido"),
  checked: z.coerce.boolean().default(false),
  notes: optionalText,
});

export const prodSelectedItemUpdateSchema = z.object({
  id: z.string().uuid("Item inválido"),
  selected: z.coerce.boolean().default(false),
  quantity: optionalQuantity,
  location: optionalText,
  withdrawn: z.coerce.boolean().default(false),
  packed: z.coerce.boolean().default(false),
  event_date: optionalText,
  notes: optionalText,
});

export const prodShippingUpdateSchema = z.object({
  prod_id: z.string().uuid("PROD inválida"),
  shipping_location: optionalText,
  entered_at: optionalText,
  planned_departure: optionalText,
  actual_departure: optionalText,
  status: z.string().trim().min(1, "Informe o status da expedição"),
  notes: optionalText,
});

export const freightSchema = z.object({
  title: z.string().trim().min(2, "Informe o título da rota"),
  freight_date: z.string().trim().min(1, "Rota precisa possuir data"),
  planned_departure_time: optionalText,
  driver_id: z.string().uuid("Selecione o motorista"),
  vehicle_id: z.string().uuid("Selecione o veículo"),
  trailer_vehicle_id: optionalUuid,
  status: z.enum(ROUTE_STATUSES).default("pre_agendado"),
  expected_value: money,
  contracted_value: money,
  realized_value: money,
  additional_costs: money,
  execution_type: z.enum(ROUTE_EXECUTION_TYPES).default("terceirizado"),
  distance_km: money,
  estimated_hours: money,
  helper_hours: money,
  notes: optionalText,
});

export const freightUpdateSchema = freightSchema.extend({
  id: z.string().uuid("Rota inválida"),
});

export const freightStopSchema = z
  .object({
    freight_id: z.string().uuid(),
    position: z.coerce.number().int().positive(),
    stop_type: z.enum(STOP_TYPES),
    requesting_department_id: z.string().uuid("Departamento solicitante obrigatório"),
    requesting_profile_id: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(2, "Informe o título da parada"),
    address: z.string().trim().min(5, "Parada precisa possuir endereço"),
    contact: optionalText,
    phone: optionalText,
    planned_window: optionalText,
    notes: optionalText,
    status: z.string().trim().min(1).default("agendado"),
    requires_proof: z.coerce.boolean().default(false),
    completed: z.coerce.boolean().default(false),
    prod_ids: z.array(z.string().uuid()).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.stop_type === "entrega_prod" && value.prod_ids.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Entrega de PROD precisa possuir ao menos uma PROD",
        path: ["prod_ids"],
      });
    }
  });

export const extraServiceSchema = z.object({
  service_type: z.enum(["entrega_avulsa", "coleta_avulsa", "entrega_coleta_avulsa"]),
  requesting_department_id: z.string().uuid("Departamento solicitante obrigatório"),
  requesting_profile_id: z.string().uuid().nullable().optional(),
  recipient_id: z.string().uuid("Selecione o destinatário"),
  service_catalog_id: z.string().uuid("Selecione o serviço"),
  recipient_or_place: optionalText,
  address: optionalText,
  contact: optionalText,
  phone: optionalText,
  service_description: optionalText,
  materials_description: optionalText,
  desired_date: optionalText,
  desired_window: optionalText,
  priority: z.enum(PRIORITIES).default("normal"),
  notes: optionalText,
  requires_proof: z.coerce.boolean().default(false),
  status: z.enum(EXTRA_SERVICE_STATUSES).default("previsto"),
  client_id: z.string().uuid().nullable().optional(),
  contract_id: z.string().uuid().nullable().optional(),
  prod_id: z.string().uuid().nullable().optional(),
});

export function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
