import { NextResponse } from "next/server";
import { parseContractScopePdf } from "@/lib/contract-scope-pdf";
import { getErrorMessage, getHttpStatus, HttpError, requirePermissionAccess } from "@/lib/server-access";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePermissionAccess("production.contracts.edit", "Sem permissão para revisar os itens do contrato.");
    const { id } = await params;
    const { data: contract, error } = await context.admin.from("production_contracts")
      .select("contract_number").eq("id", id).eq("company_id", context.profile.company_id).eq("active", true).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!contract) throw new HttpError(404, "Contrato não encontrado.");
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) throw new HttpError(400, "Envie um PDF de até 3 MB.");
    let preview;
    try {
      preview = await parseContractScopePdf(Buffer.from(await file.arrayBuffer()));
    } catch (cause) {
      throw new HttpError(400, cause instanceof Error ? cause.message : "Não foi possível ler o PDF.");
    }
    if (preview.contractNumber !== contract.contract_number) throw new HttpError(400, "O número do PDF não corresponde ao contrato desta obra.");
    return NextResponse.json({ fileName: file.name, ...preview });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, "Não foi possível ler o PDF.") }, { status: getHttpStatus(error) });
  }
}
