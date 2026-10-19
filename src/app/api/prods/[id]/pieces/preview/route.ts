import { NextResponse } from "next/server";
import { parseProdPiecesPdf } from "@/lib/prod-pieces-pdf";
import {
  getErrorMessage,
  getHttpStatus,
  HttpError,
  requirePermissionAccess,
} from "@/lib/server-access";

export const runtime = "nodejs";

function jsonError(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: getErrorMessage(error, fallback) },
    { status: getHttpStatus(error) },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requirePermissionAccess(
      "production.prods.import_pieces",
      "Você não possui permissão para importar peças da PROD.",
    );
    const { id } = await params;

    const { data: prod, error: prodError } = await context.admin
      .from("production_prods")
      .select("id")
      .eq("company_id", context.profile.company_id)
      .eq("id", id)
      .maybeSingle();

    if (prodError) throw new HttpError(500, prodError.message);
    if (!prod) throw new HttpError(404, "PROD não encontrada.");

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new HttpError(400, "Envie um PDF válido.");
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new HttpError(400, "O PDF deve ter até 10 MB.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseProdPiecesPdf(buffer);
    const previewCodes = Array.from(
      new Set(parsed.pieces.map((piece) => piece.piece_code).filter(Boolean)),
    );
    let duplicatePieceCodes: string[] = [];

    if (previewCodes.length) {
      const { data: existingPieces, error: existingPiecesError } = await context.admin
        .from("production_prod_pieces")
        .select("piece_code")
        .eq("company_id", context.profile.company_id)
        .eq("prod_id", id)
        .in("piece_code", previewCodes);

      if (existingPiecesError) throw new HttpError(500, existingPiecesError.message);

      duplicatePieceCodes = ((existingPieces ?? []) as Array<{ piece_code: string }>).map(
        (piece) => piece.piece_code,
      );
    }

    const duplicateCodeSet = new Set(duplicatePieceCodes);
    const duplicateWarning = duplicatePieceCodes.length
      ? `${duplicatePieceCodes.length} peça(s) do PDF já estão cadastrada(s) nesta PROD e serão ignorada(s) ao confirmar.`
      : null;

    return NextResponse.json({
      fileName: file.name,
      ...parsed,
      pieces: parsed.pieces.map((piece) => ({
        ...piece,
        duplicate_of_existing: duplicateCodeSet.has(piece.piece_code),
      })),
      duplicatePieceCodes,
      warnings: duplicateWarning ? [...parsed.warnings, duplicateWarning] : parsed.warnings,
    });
  } catch (error) {
    return jsonError(error, "Não foi possível importar a prévia do PDF.");
  }
}
