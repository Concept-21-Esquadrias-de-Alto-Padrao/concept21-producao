import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import type { ExpeditionRomaneioReport } from "@/lib/expedition";

const margin = 10;
const charcoal: [number, number, number] = [17, 19, 22];
const accent: [number, number, number] = [249, 115, 22];
const muted: [number, number, number] = [113, 113, 122];
const border: [number, number, number] = [229, 231, 235];

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function textLines(doc: jsPDF, value: string, width: number) {
  return doc.splitTextToSize(value || "Não informado", width) as string[];
}

function drawPageHeader(doc: jsPDF, report: ExpeditionRomaneioReport) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...charcoal);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setFillColor(...accent);
  doc.roundedRect(margin, 7, 18, 14, 2, 2, "F");
  doc.setTextColor(...charcoal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("C21", margin + 5, 16);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text("Concept21 Aluminium", margin + 25, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Romaneio de entrega de esquadrias", margin + 25, 19);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(report.title.toUpperCase(), pageWidth - margin, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Emitido em ${report.generatedAt}`, pageWidth - margin, 20, { align: "right" });
}

function drawInfoCard(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  doc.setDrawColor(...border);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...accent);
  doc.text(label.toUpperCase(), x + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...charcoal);
  doc.text(textLines(doc, value, width - 6), x + 3, y + 10, {
    lineHeightFactor: 1.15,
    maxWidth: width - 6,
  });
}

function drawInfoGrid(doc: jsPDF, report: ExpeditionRomaneioReport) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 3;
  const columnWidth = (pageWidth - margin * 2 - gap * 2) / 3;
  let y = 34;

  const firstRow = [
    ["Cliente", report.client],
    ["Contrato / PROD", `${report.contractNumber} · PROD ${report.prodNumber}`],
    ["Volumes", `${report.totalVolumes} volume(s) · ${report.totalItems} item(ns)`],
  ] as const;

  firstRow.forEach(([label, value], index) => {
    drawInfoCard(doc, label, value, margin + index * (columnWidth + gap), y, columnWidth, 18);
  });

  y += 21;
  const secondRow = [
    ["Obra", report.workName],
    ["Cidade / UF", report.cityState],
    ["Contato", `${report.contact} · ${report.phone}`],
  ] as const;

  secondRow.forEach(([label, value], index) => {
    drawInfoCard(doc, label, value, margin + index * (columnWidth + gap), y, columnWidth, 20);
  });

  y += 23;
  drawInfoCard(doc, "Endereço da obra", report.address, margin, y, columnWidth * 2 + gap, 24);
  drawInfoCard(doc, "Tratamento / Cor", report.color, margin + (columnWidth + gap) * 2, y, columnWidth, 24);

  return y + 30;
}

function lastAutoTableY(doc: jsPDF, fallback: number) {
  return (
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback
  );
}

function runTable(doc: jsPDF, options: UserOptions) {
  return import("jspdf-autotable").then(({ default: autoTable }) => autoTable(doc, options));
}

async function drawItemsTable(doc: jsPDF, report: ExpeditionRomaneioReport, startY: number) {
  await runTable(doc, {
    startY,
    head: [["#", "Peça", "Qtd.", "Descrição", "Dimensões", "Local", "Vol.", "Observações"]],
    body:
      report.rows.length > 0
        ? report.rows.map((row) => [
            row.index,
            row.pieceCode,
            row.quantity,
            row.description,
            row.dimensions,
            row.location,
            row.volumes,
            row.observations || "-",
          ])
        : [["-", "Sem peças", "-", "Nenhuma peça com controle de carga preenchido.", "-", "-", "-", "-"]],
    theme: "grid",
    margin: { left: margin, right: margin, top: 34, bottom: 18 },
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 1.8,
      textColor: charcoal,
      overflow: "linebreak",
      valign: "top",
      lineColor: border,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: charcoal,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 24 },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 88 },
      4: { cellWidth: 24, halign: "center" },
      5: { cellWidth: 32 },
      6: { cellWidth: 13, halign: "center" },
      7: { cellWidth: 75 },
    },
    didDrawPage: () => {
      drawPageHeader(doc, report);
      drawFooterOnCurrentPage(doc);
    },
  });
}

function ensureSpace(doc: jsPDF, y: number, requiredHeight: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + requiredHeight <= pageHeight - 18) return y;
  doc.addPage();
  return 36;
}

function drawSummaryAndSignature(doc: jsPDF, report: ExpeditionRomaneioReport) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = ensureSpace(doc, lastAutoTableY(doc, 110) + 8, 56);

  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(254, 215, 170);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 14, 1.5, 1.5, "FD");
  doc.setTextColor(...charcoal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Total de itens: ${report.totalItems}`, margin + 4, y + 6);
  doc.text(`Total de volumes: ${report.totalVolumes}`, margin + 58, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Conferir todos os itens antes da assinatura.", pageWidth - margin - 4, y + 6, {
    align: "right",
  });

  y += 20;
  doc.setDrawColor(...border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 40, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Recebimento", margin + 4, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    textLines(
      doc,
      `Recebi da Concept21 Aluminium as mercadorias relacionadas neste romaneio, embaladas em ${report.totalVolumes} volume(s).`,
      pageWidth - margin * 2 - 8,
    ),
    margin + 4,
    y + 14,
  );
  doc.line(margin + 4, y + 30, margin + 82, y + 30);
  doc.line(margin + 98, y + 30, pageWidth - margin - 4, y + 30);
  doc.setTextColor(...muted);
  doc.setFontSize(7);
  doc.text("Data", margin + 38, y + 35, { align: "center" });
  doc.text("Nome legível e assinatura", margin + 178, y + 35, { align: "center" });
}

function drawFooterOnCurrentPage(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setDrawColor(...border);
  doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Plataforma interna Concept21 Aluminium", margin, pageHeight - 6);
}

function drawPageNumbers(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 6, {
      align: "right",
    });
  }
}

export async function downloadExpeditionRomaneioPdf(report: ExpeditionRomaneioReport) {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  drawPageHeader(doc, report);
  const tableStartY = drawInfoGrid(doc, report);
  await drawItemsTable(doc, report, tableStartY);
  drawSummaryAndSignature(doc, report);
  drawPageNumbers(doc);
  doc.save(
    `romaneio-${safeFileName(report.client)}-${safeFileName(report.contractNumber)}-prod-${safeFileName(
      report.prodNumber,
    )}.pdf`,
  );
}
