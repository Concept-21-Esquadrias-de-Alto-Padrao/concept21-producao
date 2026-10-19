import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import type { ProductionPointingReport } from "@/lib/pointing-report";
import { formatDateTime } from "@/lib/utils";

function durationLabel(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}min ${String(remainingSeconds).padStart(2, "0")}s`;
}

function drawHeader(doc: jsPDF, report: ProductionPointingReport) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(17, 19, 22);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 34, pageWidth, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Concept21 Aluminium", 14, 14);
  doc.setFontSize(18);
  doc.text("Relatório de apontamentos", 14, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Produção por peça e operador", pageWidth - 14, 17, { align: "right" });
  doc.text(`Emitido em ${formatDateTime(report.generatedAt)}`, pageWidth - 14, 25, {
    align: "right",
  });
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(229, 231, 235);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);
    doc.setTextColor(113, 113, 122);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Plataforma interna Concept21 Aluminium - Produção", 14, pageHeight - 8);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: "right",
    });
  }
}

function drawMetricCards(doc: jsPDF, report: ProductionPointingReport) {
  const metrics = [
    { label: "Eventos", value: report.metrics.events },
    { label: "Peças", value: report.metrics.pieces },
    { label: "Operadores", value: report.metrics.operators },
    { label: "Produtivo", value: durationLabel(report.metrics.productiveSeconds) },
    { label: "Parado", value: durationLabel(report.metrics.pausedSeconds) },
  ];
  const cardWidth = 51;
  const gap = 3;
  const top = 47;

  metrics.forEach((metric, index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(228, 228, 231);
    doc.roundedRect(x, top, cardWidth, 18, 2, 2, "FD");
    doc.setTextColor(249, 115, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(String(metric.value), x + 3, top + 8, { maxWidth: cardWidth - 6 });
    doc.setTextColor(82, 82, 91);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(metric.label, x + 3, top + 14);
  });
}

function runTable(doc: jsPDF, options: UserOptions) {
  return import("jspdf-autotable").then(({ default: autoTable }) => autoTable(doc, options));
}

export async function downloadProductionPointingReportPdf(report: ProductionPointingReport) {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  drawHeader(doc, report);
  drawMetricCards(doc, report);

  await runTable(doc, {
    startY: 74,
    head: [[
      "Data/hora",
      "Cliente / contrato / PROD",
      "Peça",
      "Etapa",
      "Ação",
      "Responsável",
      "Participantes",
      "Motivo / observação",
    ]],
    body:
      report.rows.length > 0
        ? report.rows.map((row) => [
            formatDateTime(row.eventAt),
            `${row.clientName}\nContrato ${row.contractNumber} · ${row.prodNumber}\n${row.workName}`,
            `${row.pieceCode}\n${row.systemCode}`,
            row.stageName,
            row.actionLabel,
            row.operatorName,
            row.participantNames.length ? row.participantNames.join(", ") : "-",
            [row.reason ? `Motivo: ${row.reason}` : "", row.notes ? `Obs.: ${row.notes}` : ""]
              .filter(Boolean)
              .join("\n") || "-",
          ])
        : [["Sem apontamentos", "-", "-", "-", "-", "-", "-", "-"]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 1.5,
      textColor: [39, 39, 42],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: { fillColor: [17, 19, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 54 },
      2: { cellWidth: 42 },
      3: { cellWidth: 28 },
      4: { cellWidth: 24 },
      5: { cellWidth: 38 },
      6: { cellWidth: 38 },
      7: { cellWidth: 31 },
    },
    margin: { top: 44, left: 14, right: 14, bottom: 18 },
    didDrawPage: () => {
      drawHeader(doc, report);
    },
  });

  drawFooter(doc);
  doc.save("relatorio-apontamentos-producao.pdf");
}
