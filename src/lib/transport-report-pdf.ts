import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

export type TransportPeriodPdfReport = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  metrics: Array<{ label: string; value: string | number }>;
  statusRows: Array<{ status: string; count: number }>;
  driverRows: Array<{ driver: string; routes: number; value: string }>;
  clientRows: Array<{ client: string; prods: number; routes: number }>;
  routeRows: Array<{
    date: string;
    title: string;
    driver: string;
    vehicle: string;
    status: string;
    stops: number;
    value: string;
    internalCost: string;
    distanceKm: string;
  }>;
};

function drawHeader(doc: jsPDF, report: TransportPeriodPdfReport) {
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
  doc.text(report.title, 14, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(report.periodLabel, pageWidth - 14, 17, { align: "right" });
  doc.text(`Emitido em ${report.generatedAt}`, pageWidth - 14, 25, { align: "right" });
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
    doc.text("Plataforma interna Concept21 Aluminium - Transporte", 14, pageHeight - 8);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: "right",
    });
  }
}

function drawMetricCards(doc: jsPDF, report: TransportPeriodPdfReport) {
  const cardWidth = 28.5;
  const gap = 2;
  const top = 47;

  report.metrics.slice(0, 6).forEach((metric, index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(228, 228, 231);
    doc.roundedRect(x, top, cardWidth, 18, 2, 2, "FD");
    doc.setTextColor(249, 115, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
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

async function drawTables(doc: jsPDF, report: TransportPeriodPdfReport) {
  await runTable(doc, {
    startY: 76,
    head: [["Status", "Quantidade"]],
    body:
      report.statusRows.length > 0
        ? report.statusRows.map((row) => [row.status, row.count])
        : [["Sem registros", "-"]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [39, 39, 42] },
    headStyles: { fillColor: [17, 19, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 14, right: 14 },
  });

  await runTable(doc, {
    startY: lastAutoTableY(doc, 76) + 10,
    head: [["Motorista", "Rotas", "Valor previsto"]],
    body:
      report.driverRows.length > 0
        ? report.driverRows.map((row) => [row.driver, row.routes, row.value])
        : [["Sem motoristas no período", "-", "-"]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [39, 39, 42] },
    headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 14, right: 14 },
  });

  await runTable(doc, {
    startY: lastAutoTableY(doc, 104) + 10,
    head: [["Cliente", "PRODs", "Paradas"]],
    body:
      report.clientRows.length > 0
        ? report.clientRows.map((row) => [row.client, row.prods, row.routes])
        : [["Sem clientes no período", "-", "-"]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [39, 39, 42] },
    headStyles: { fillColor: [249, 115, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 14, right: 14 },
  });

  await runTable(doc, {
    startY: lastAutoTableY(doc, 132) + 12,
    head: [["Data", "Rota", "Motorista", "Veículo", "Status", "Paradas", "Valor", "Custo", "Km"]],
    body:
      report.routeRows.length > 0
        ? report.routeRows.map((row) => [
            row.date,
            row.title,
            row.driver,
            row.vehicle,
            row.status,
            row.stops,
            row.value,
            row.internalCost,
            row.distanceKm,
          ])
        : [["Sem rotas no período", "-", "-", "-", "-", "-", "-", "-", "-"]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.1,
      cellPadding: 1.6,
      overflow: "linebreak",
      valign: "top",
      textColor: [39, 39, 42],
    },
    headStyles: { fillColor: [17, 19, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 34 },
      2: { cellWidth: 26 },
      3: { cellWidth: 28 },
      4: { cellWidth: 22 },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: 20 },
      7: { cellWidth: 20 },
      8: { cellWidth: 11, halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      drawHeader(doc, report);
    },
  });
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function downloadTransportPeriodReportPdf(report: TransportPeriodPdfReport) {
  const { default: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  drawHeader(doc, report);
  drawMetricCards(doc, report);
  await drawTables(doc, report);
  drawFooter(doc);
  doc.save(`relatorio-transporte-${safeFileName(report.title)}-${safeFileName(report.periodLabel)}.pdf`);
}
