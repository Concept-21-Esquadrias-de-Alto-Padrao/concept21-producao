import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getHttpStatus,
  HttpError,
  requirePermissionAccess,
  type AuthenticatedProfileContext,
} from "@/lib/server-access";
import type {
  ExtraServiceCatalog,
  LogisticsDriver,
  LogisticsRecipient,
  LogisticsSettings,
  LogisticsVehicle,
} from "@/lib/types";

type LogisticsActionBody = Record<string, unknown> & {
  action?: string;
};

type LogisticsTable =
  | "logistics_recipients"
  | "logistics_drivers"
  | "logistics_vehicles"
  | "extra_service_catalog";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function nonNegativeNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function ownershipType(value: unknown) {
  return value === "proprio" ? "proprio" : "terceiro";
}

function vehicleKind(value: unknown) {
  return value === "carretinha" ? "carretinha" : "veiculo";
}

function jsonError(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: getErrorMessage(error, fallback) },
    { status: getHttpStatus(error) },
  );
}

async function requireLogisticsAccess() {
  return requirePermissionAccess(
    "production.settings.manage_logistics",
    "Você não possui permissão para alterar os cadastros logísticos.",
  );
}

async function loadLogisticsData(context: AuthenticatedProfileContext) {
  const [recipients, drivers, vehicles, settings, serviceCatalog] = await Promise.all([
    context.admin
      .from("logistics_recipients")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
    context.admin
      .from("logistics_drivers")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
    context.admin
      .from("logistics_vehicles")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
    context.admin
      .from("logistics_settings")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .maybeSingle(),
    context.admin
      .from("extra_service_catalog")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
  ]);

  const queryError = [
    recipients.error,
    drivers.error,
    vehicles.error,
    settings.error,
    serviceCatalog.error,
  ].find(Boolean);
  if (queryError) throw new HttpError(500, queryError.message);

  const logisticsSettings =
    (settings.data as LogisticsSettings | null) ??
    ({
      company_id: context.profile.company_id,
      fuel_price_per_liter: 0,
      updated_at: new Date(0).toISOString(),
    } satisfies LogisticsSettings);

  return {
    recipients: (recipients.data ?? []) as LogisticsRecipient[],
    drivers: (drivers.data ?? []) as LogisticsDriver[],
    vehicles: (vehicles.data ?? []) as LogisticsVehicle[],
    settings: {
      ...logisticsSettings,
      fuel_price_per_liter: Number(logisticsSettings.fuel_price_per_liter ?? 0),
    },
    serviceCatalog: (serviceCatalog.data ?? []) as ExtraServiceCatalog[],
  };
}

async function assertRecordExists(
  context: AuthenticatedProfileContext,
  table: LogisticsTable,
  id: string,
  label: string,
) {
  const { data, error } = await context.admin
    .from(table)
    .select("id")
    .eq("company_id", context.profile.company_id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, `${label} não encontrado.`);
}

export async function GET() {
  try {
    const context = await requireLogisticsAccess();
    const data = await loadLogisticsData(context);

    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error, "Não foi possível carregar os cadastros logísticos.");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireLogisticsAccess();
    const body = (await request.json().catch(() => ({}))) as LogisticsActionBody;

    switch (body.action) {
      case "createRecipient": {
        const name = text(body.name);
        const address = text(body.address);
        if (!name || !address) throw new HttpError(400, "Informe o nome e o endereço.");

        const { error } = await context.admin.from("logistics_recipients").insert({
          company_id: context.profile.company_id,
          name,
          address,
          active: bool(body.active),
          created_by: context.authUserId,
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateRecipient": {
        const id = text(body.id);
        const name = text(body.name);
        const address = text(body.address);
        if (!id || !name || !address) {
          throw new HttpError(400, "Informe o destinatário, o nome e o endereço.");
        }

        await assertRecordExists(context, "logistics_recipients", id, "Destinatário");

        const { error } = await context.admin
          .from("logistics_recipients")
          .update({ name, address, active: bool(body.active) })
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteRecipient": {
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Destinatário inválido.");

        await assertRecordExists(context, "logistics_recipients", id, "Destinatário");

        const { error } = await context.admin.from("logistics_recipients").delete().eq("id", id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "createDriver": {
        const name = text(body.name);
        if (!name) throw new HttpError(400, "Informe o nome do motorista.");

        const { error } = await context.admin.from("logistics_drivers").insert({
          company_id: context.profile.company_id,
          name,
          hourly_cost: nonNegativeNumber(body.hourly_cost),
          can_drive: bool(body.can_drive),
          can_help: bool(body.can_help, false),
          active: bool(body.active),
          created_by: context.authUserId,
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateDriver": {
        const id = text(body.id);
        const name = text(body.name);
        if (!id || !name) throw new HttpError(400, "Informe o motorista e o nome.");

        await assertRecordExists(context, "logistics_drivers", id, "Motorista");

        const { error } = await context.admin
          .from("logistics_drivers")
          .update({
            name,
            hourly_cost: nonNegativeNumber(body.hourly_cost),
            can_drive: bool(body.can_drive),
            can_help: bool(body.can_help, false),
            active: bool(body.active),
          })
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteDriver": {
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Motorista inválido.");

        await assertRecordExists(context, "logistics_drivers", id, "Motorista");

        const { error } = await context.admin.from("logistics_drivers").delete().eq("id", id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "createVehicle": {
        const name = text(body.name);
        const plate = text(body.plate).toUpperCase();
        const kind = vehicleKind(body.vehicle_kind);
        const ownership = kind === "carretinha" ? "proprio" : ownershipType(body.ownership_type);
        if (!name || !plate) throw new HttpError(400, "Informe o veículo e a placa.");

        const { error } = await context.admin.from("logistics_vehicles").insert({
          company_id: context.profile.company_id,
          name,
          plate,
          vehicle_kind: kind,
          ownership_type: ownership,
          fuel_consumption_km_l: kind === "carretinha" ? 0 : nonNegativeNumber(body.fuel_consumption_km_l),
          wear_cost_per_km: nonNegativeNumber(body.wear_cost_per_km),
          active: bool(body.active),
          created_by: context.authUserId,
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateVehicle": {
        const id = text(body.id);
        const name = text(body.name);
        const plate = text(body.plate).toUpperCase();
        const kind = vehicleKind(body.vehicle_kind);
        const ownership = kind === "carretinha" ? "proprio" : ownershipType(body.ownership_type);
        if (!id || !name || !plate) {
          throw new HttpError(400, "Informe o veículo, o nome e a placa.");
        }

        await assertRecordExists(context, "logistics_vehicles", id, "Veículo");

        const { error } = await context.admin
          .from("logistics_vehicles")
          .update({
            name,
            plate,
            vehicle_kind: kind,
            ownership_type: ownership,
            fuel_consumption_km_l: kind === "carretinha" ? 0 : nonNegativeNumber(body.fuel_consumption_km_l),
            wear_cost_per_km: nonNegativeNumber(body.wear_cost_per_km),
            active: bool(body.active),
          })
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteVehicle": {
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Veículo inválido.");

        await assertRecordExists(context, "logistics_vehicles", id, "Veículo");

        const { error } = await context.admin.from("logistics_vehicles").delete().eq("id", id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateSettings": {
        const { error } = await context.admin.from("logistics_settings").upsert(
          {
            company_id: context.profile.company_id,
            fuel_price_per_liter: nonNegativeNumber(body.fuel_price_per_liter),
            updated_by: context.authUserId,
          },
          { onConflict: "company_id" },
        );

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "createService": {
        const name = text(body.name);
        const description = text(body.description);
        if (!name || !description) {
          throw new HttpError(400, "Informe o nome e a descrição do serviço.");
        }

        const { error } = await context.admin.from("extra_service_catalog").insert({
          company_id: context.profile.company_id,
          name,
          description,
          active: bool(body.active),
          created_by: context.authUserId,
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateService": {
        const id = text(body.id);
        const name = text(body.name);
        const description = text(body.description);
        if (!id || !name || !description) {
          throw new HttpError(400, "Informe o serviço, o nome e a descrição.");
        }

        await assertRecordExists(context, "extra_service_catalog", id, "Serviço");

        const { error } = await context.admin
          .from("extra_service_catalog")
          .update({ name, description, active: bool(body.active) })
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteService": {
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Serviço inválido.");

        await assertRecordExists(context, "extra_service_catalog", id, "Serviço");

        const { error } = await context.admin.from("extra_service_catalog").delete().eq("id", id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      default:
        throw new HttpError(400, "Ação logística inválida.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Não foi possível salvar os cadastros logísticos.");
  }
}
