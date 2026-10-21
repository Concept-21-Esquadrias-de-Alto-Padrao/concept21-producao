import { isTransportStage, TRANSPORT_ENABLED, TRANSPORT_DISABLED_MESSAGE } from "@/lib/transport-module";
import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getHttpStatus,
  HttpError,
  requireMasterAccess,
  type MasterAccessContext,
} from "@/lib/server-access";
import type { Department, ProductionStage, StorageLocation } from "@/lib/types";

type OperationalActionBody = Record<string, unknown> & {
  action?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function bool(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInteger(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function jsonError(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: getErrorMessage(error, fallback) },
    { status: getHttpStatus(error) },
  );
}

async function loadOperationalData(context: MasterAccessContext) {
  const [departments, stages, locations] = await Promise.all([
    context.admin
      .from("departments")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
    context.admin
      .from("production_stages")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("sort_order", { ascending: true }),
    context.admin
      .from("storage_locations")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
  ]);

  const queryError = [departments.error, stages.error, locations.error].find(Boolean);
  if (queryError) throw new HttpError(500, queryError.message);

  return {
    departments: (departments.data ?? []) as Department[],
    stages: ((stages.data ?? []) as ProductionStage[]).filter((stage) => TRANSPORT_ENABLED || !isTransportStage(stage)),
    storageLocations: (locations.data ?? []) as StorageLocation[],
  };
}

async function assertRecordExists(
  context: MasterAccessContext,
  table: "departments" | "production_stages" | "storage_locations",
  id: string,
  label: string,
) {
  const { data, error } = await context.admin
    .from(table)
    .select("*")
    .eq("company_id", context.profile.company_id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, `${label} não encontrado.`);
  if (table === "production_stages" && !TRANSPORT_ENABLED && isTransportStage(data)) {
    throw new HttpError(410, TRANSPORT_DISABLED_MESSAGE);
  }
}

export async function GET() {
  try {
    const context = await requireMasterAccess();
    const data = await loadOperationalData(context);

    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error, "Não foi possível carregar os cadastros operacionais.");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireMasterAccess();
    const body = (await request.json().catch(() => ({}))) as OperationalActionBody;

    if (!TRANSPORT_ENABLED && ["createStage", "updateStage"].includes(body.action ?? "") &&
        isTransportStage({ name: text(body.name), required_permission: text(body.requiredPermission) })) {
      throw new HttpError(410, TRANSPORT_DISABLED_MESSAGE);
    }

    switch (body.action) {
      case "createDepartment": {
        const name = text(body.name);
        if (!name) throw new HttpError(400, "Informe o nome do departamento.");

        const { error } = await context.admin.from("departments").insert({
          company_id: context.profile.company_id,
          name,
          active: bool(body.active),
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateDepartment": {
        const id = text(body.id);
        const name = text(body.name);
        if (!id || !name) throw new HttpError(400, "Informe o departamento e o nome.");

        await assertRecordExists(context, "departments", id, "Departamento");

        const { error } = await context.admin
          .from("departments")
          .update({ name, active: bool(body.active) })
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteDepartment": {
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Departamento inválido.");

        await assertRecordExists(context, "departments", id, "Departamento");

        const { error } = await context.admin.from("departments").delete().eq("id", id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "createStage": {
        const name = text(body.name);
        const sortOrder = positiveInteger(body.sortOrder);
        if (!name || !sortOrder) throw new HttpError(400, "Informe a etapa e a ordem.");

        const { error } = await context.admin.from("production_stages").insert({
          company_id: context.profile.company_id,
          name,
          description: nullableText(body.description),
          sort_order: sortOrder,
          required_permission: nullableText(body.requiredPermission),
          active: bool(body.active),
          created_by: context.authUserId,
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateStage": {
        const id = text(body.id);
        const name = text(body.name);
        const sortOrder = positiveInteger(body.sortOrder);
        if (!id || !name || !sortOrder) {
          throw new HttpError(400, "Informe a etapa, o nome e a ordem.");
        }

        await assertRecordExists(context, "production_stages", id, "Etapa");

        const { error } = await context.admin
          .from("production_stages")
          .update({
            name,
            description: nullableText(body.description),
            sort_order: sortOrder,
            required_permission: nullableText(body.requiredPermission),
            active: bool(body.active),
          })
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteStage": {
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Etapa inválida.");

        await assertRecordExists(context, "production_stages", id, "Etapa");

        const { error } = await context.admin.from("production_stages").delete().eq("id", id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "createLocation": {
        const name = text(body.name);
        const type = text(body.type);
        if (!name || !type) throw new HttpError(400, "Informe a localização e o tipo.");

        const { error } = await context.admin.from("storage_locations").insert({
          company_id: context.profile.company_id,
          name,
          code: nullableText(body.code),
          type,
          material_group: nullableText(body.materialGroup),
          description: nullableText(body.description),
          active: bool(body.active),
          created_by: context.authUserId,
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateLocation": {
        const id = text(body.id);
        const name = text(body.name);
        const type = text(body.type);
        if (!id || !name || !type) {
          throw new HttpError(400, "Informe a localização, o nome e o tipo.");
        }

        await assertRecordExists(context, "storage_locations", id, "Localização");

        const { error } = await context.admin
          .from("storage_locations")
          .update({
            name,
            code: nullableText(body.code),
            type,
            material_group: nullableText(body.materialGroup),
            description: nullableText(body.description),
            active: bool(body.active),
          })
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteLocation": {
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Localização inválida.");

        await assertRecordExists(context, "storage_locations", id, "Localização");

        const { error } = await context.admin.from("storage_locations").delete().eq("id", id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      default:
        throw new HttpError(400, "Ação operacional inválida.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Não foi possível salvar as configurações operacionais.");
  }
}
