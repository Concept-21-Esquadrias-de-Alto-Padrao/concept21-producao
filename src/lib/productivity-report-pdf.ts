import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import type { ProductionProductivityReport } from "@/lib/productivity-report";
import { formatDateTime } from "@/lib/utils";

function decimalLabel(value: number, digits = 2) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function durationLabel(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function drawHeader(doc: jsPDF, report: ProductionProductivityReport) {
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
  doc.text("Relatório de produtividade", 14, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Produção por colaborador", pageWidth - 14, 17, { align: "right" });
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

function drawMetricCards(doc: jsPDF, report: ProductionProductivityReport) {
  const metrics = [
    { label: "Colaboradores", value: report.metrics.operators },
    { label: "Tempo produtivo", value: `${decimalLabel(report.metrics.productiveHours)}h` },
    { label: "Tempo parado", value: `${decimalLabel(report.metrics.pausedHours)}h` },
    { label: "Peças concluídas", value: report.metrics.completedPieces },
    { label: "Peso concluído", value: `${decimalLabel(report.metrics.completedWeightKg, 3)} kg` },
  ];
  const cardWidth = 35;
  const gap = 3;
  const top = 47;

  metrics.forEach((metric, index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(228, 228, 231);
    doc.roundedRect(x, top, cardWidth, 18, 2, 2, "FD");
    doc.setTextColor(249, 115, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(String(metric.value), x + 3, top + 8);
    doc.setTextColor(82, 82, 91);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(metric.label, x + 3, top + 14);
  });
}

function lastAutoTableY(doc: jsPDF, fallback: number) {
  return (
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback
  );
}

function runTable(doc: jsPDF, options: UserOptions) {
  return import("jspdf-autotable").then(({ default: autoTable }) => autoTable(doc, options));
}

async function drawTables(doc: jsPDF, report: ProductionProductivityReport) {
  await runTable(doc, {
    startY: 76,
    head: [["Colaborador", "Matrícula", "Produtivo", "Parado", "Peças", "Kg", "Peças/h", "Kg/h"]],
    body:
      report.operatorRows.length > 0
        ? report.operatorRows.map((row) => [
            row.operatorName,
            row.registration,
            durationLabel(row.productiveSeconds),
            durationLabel(row.pausedSeconds),
            row.completedPieces,
            decimalLabel(row.completedWeightKg, 3),
            decimalLabel(row.piecesPerHour),
            decimalLabel(row.kgPerHour),
          ])
        : [["Sem apontamentos", "-", "-", "-", "-", "-", "-", "-"]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.8, textColor: [39, 39, 42] },
    headStyles: { fillColor: [17, 19, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { top: 44, left: 14, right: 14, bottom: 18 },
    didDrawPage: () => {
      drawHeader(doc, report);
    },
  });

  await runTable(doc, {
    startY: lastAutoTableY(doc, 76) + 10,
    head: [["Colaborador", "Etapa", "Produtivo", "Parado", "Peças", "Kg", "Peças/h", "Kg/h"]],
    body:
      report.stageRows.length > 0
        ? report.stageRows.map((row) => [
            row.operatorName,
            row.stageName,
            durationLabel(row.productiveSeconds),
            durationLabel(row.pausedSeconds),
            row.completedPieces,
            decimalLabel(row.completedWeightKg, 3),
            decimalLabel(row.piecesPerHour),
            decimalLabel(row.kgPerHour),
          ])
        : [["Sem etapas apontadas", "-", "-", "-", "-", "-", "-", "-"]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 7.3, cellPadding: 1.7, textColor: [39, 39, 42] },
    headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { top: 44, left: 14, right: 14, bottom: 18 },
    didDrawPage: () => {
      drawHeader(doc, report);
    },
  });
}

export async function downloadProductionProductivityReportPdf(
  report: ProductionProductivityReport,
) {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  drawHeader(doc, report);
  drawMetricCards(doc, report);
  await drawTables(doc, report);
  drawFooter(doc);
  doc.save("relatorio-produtividade-producao.pdf");
}
