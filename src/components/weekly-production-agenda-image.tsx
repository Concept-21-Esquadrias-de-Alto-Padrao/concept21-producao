"use client";

import { Download, ImageDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type WeeklyAgendaRow = {
  date: string;
  client: string;
  detail: string;
  status: string;
  tone: "orange" | "green" | "blue" | "amber" | "red" | "gray";
};

type WeeklyProductionAgendaImageProps = {
  currentWeek: WeeklyAgendaRow[];
  nextWeek: WeeklyAgendaRow[];
};

type ToneTheme = {
  start: string;
  end: string;
  icon: string;
  iconKind: "production" | "cut" | "rack" | "box" | "alert" | "neutral";
};

function formatDate(value: string) {
  if (!value) return "--/--/----";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function toneTheme(tone: WeeklyAgendaRow["tone"]): ToneTheme {
  const themes: Record<WeeklyAgendaRow["tone"], ToneTheme> = {
    orange: { start: "#ff7a12", end: "#df4b00", icon: "#ff6a00", iconKind: "production" },
    green: { start: "#4bbf22", end: "#238c11", icon: "#35aa1d", iconKind: "cut" },
    blue: { start: "#2875ea", end: "#123f9f", icon: "#1556bd", iconKind: "rack" },
    amber: { start: "#f1aa14", end: "#d27400", icon: "#e59a00", iconKind: "box" },
    red: { start: "#de3a30", end: "#a61c18", icon: "#c92922", iconKind: "alert" },
    gray: { start: "#7a818c", end: "#3d424a", icon: "#5b6270", iconKind: "neutral" },
  };

  return themes[tone];
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient,
) {
  context.fillStyle = fillStyle;
  drawRoundedRect(context, x, y, width, height, radius);
  context.fill();
}

function fitFont(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  template: string,
  minSize: number,
) {
  const match = template.match(/(\d+)px/);
  const originalSize = match ? Number(match[1]) : 28;

  for (let size = originalSize; size >= minSize; size -= 1) {
    const candidate = template.replace(/\d+px/, `${size}px`);
    context.font = candidate;
    if (context.measureText(text).width <= maxWidth) return candidate;
  }

  return template.replace(/\d+px/, `${minSize}px`);
}

function truncateText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  if (context.measureText(text).width <= maxWidth) return text;
  let next = text;

  while (next.length > 3 && context.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return `${next}...`;
}

function drawGlowLine(
  context: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  y: number,
) {
  const gradient = context.createLinearGradient(fromX, y, toX, y);
  gradient.addColorStop(0, "rgba(255,106,0,0)");
  gradient.addColorStop(0.5, "#ff6a00");
  gradient.addColorStop(1, "rgba(255,106,0,0)");

  context.save();
  context.strokeStyle = gradient;
  context.shadowColor = "#ff6a00";
  context.shadowBlur = 18;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(fromX, y);
  context.lineTo(toX, y);
  context.stroke();
  context.restore();
}

function drawCalendarIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  context.save();
  context.strokeStyle = "#ff6a00";
  context.fillStyle = "#ff6a00";
  context.lineWidth = 4;
  drawRoundedRect(context, x, y + 8, size, size - 8, 3);
  context.stroke();
  context.fillRect(x, y + 16, size, 7);
  context.beginPath();
  context.moveTo(x + 12, y);
  context.lineTo(x + 12, y + 15);
  context.moveTo(x + size - 12, y);
  context.lineTo(x + size - 12, y + 15);
  context.stroke();

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      context.fillRect(x + 11 + column * 15, y + 30 + row * 13, 5, 5);
    }
  }

  context.restore();
}

function drawGearIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "#ff6a00";

  for (let index = 0; index < 8; index += 1) {
    context.rotate(Math.PI / 4);
    fillRoundedRect(context, -4, -radius - 8, 8, 15, 2, "#ff6a00");
  }

  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(0, 0, radius * 0.43, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawProductionIcon(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(x - 6, y - 8, 8, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(x - 6, y + 2);
  context.lineTo(x - 6, y + 22);
  context.moveTo(x - 22, y + 10);
  context.lineTo(x + 8, y + 10);
  context.moveTo(x + 10, y - 12);
  context.lineTo(x + 22, y - 4);
  context.lineTo(x + 22, y + 20);
  context.stroke();
  context.restore();
}

function drawCutIcon(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(x - 22, y + 18);
  context.lineTo(x + 22, y + 18);
  context.stroke();
  context.beginPath();
  context.arc(x + 2, y - 2, 16, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(x + 2, y - 2, 7, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawRackIcon(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.rect(x - 20, y - 18, 40, 36);
  context.moveTo(x - 8, y - 18);
  context.lineTo(x - 8, y + 18);
  context.moveTo(x + 8, y - 18);
  context.lineTo(x + 8, y + 18);
  context.moveTo(x - 20, y - 3);
  context.lineTo(x + 20, y - 3);
  context.moveTo(x - 20, y + 11);
  context.lineTo(x + 20, y + 11);
  context.stroke();
  context.restore();
}

function drawBoxIcon(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(x, y - 22);
  context.lineTo(x + 20, y - 10);
  context.lineTo(x + 20, y + 14);
  context.lineTo(x, y + 26);
  context.lineTo(x - 20, y + 14);
  context.lineTo(x - 20, y - 10);
  context.closePath();
  context.moveTo(x - 20, y - 10);
  context.lineTo(x, y + 2);
  context.lineTo(x + 20, y - 10);
  context.moveTo(x, y + 2);
  context.lineTo(x, y + 26);
  context.stroke();
  context.restore();
}

function drawStatusIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: ToneTheme,
) {
  context.save();
  const gradient = context.createRadialGradient(x - 10, y - 10, 4, x, y, 34);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.16, theme.icon);
  gradient.addColorStop(1, "#101010");
  context.fillStyle = gradient;
  context.strokeStyle = theme.icon;
  context.lineWidth = 2;
  context.shadowColor = theme.icon;
  context.shadowBlur = 12;
  context.beginPath();
  context.arc(x, y, 31, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;

  if (theme.iconKind === "production") drawProductionIcon(context, x, y);
  if (theme.iconKind === "cut") drawCutIcon(context, x, y);
  if (theme.iconKind === "rack") drawRackIcon(context, x, y);
  if (theme.iconKind === "box") drawBoxIcon(context, x, y);
  if (theme.iconKind === "alert" || theme.iconKind === "neutral") {
    context.fillStyle = "#ffffff";
    context.font = "900 34px Arial";
    context.textAlign = "center";
    context.fillText(theme.iconKind === "alert" ? "!" : "-", x, y + 12);
  }
  context.restore();
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, width * 0.72);
  gradient.addColorStop(0, "#161616");
  gradient.addColorStop(0.55, "#070707");
  gradient.addColorStop(1, "#000000");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.3;
  for (let y = 0; y < height; y += 22) {
    context.strokeStyle = y % 44 === 0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.012)";
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();

  context.save();
  context.shadowColor = "#ff6a00";
  context.shadowBlur = 18;
  context.fillStyle = "#ff6a00";
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(96, 0);
  context.lineTo(0, 96);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(width, height);
  context.lineTo(width - 96, height);
  context.lineTo(width, height - 96);
  context.closePath();
  context.fill();
  context.restore();

  context.save();
  context.strokeStyle = "#ff6a00";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(34, 156);
  context.lineTo(214, 0);
  context.moveTo(0, height - 42);
  context.lineTo(188, height);
  context.moveTo(width - 34, height - 156);
  context.lineTo(width - 214, height);
  context.stroke();
  context.restore();
}

function drawTitle(context: CanvasRenderingContext2D, width: number) {
  context.save();
  context.textBaseline = "alphabetic";

  const titleY = 78;
  const titleFont = "900 72px Arial Black, Arial";
  context.font = titleFont;
  const agenda = "AGENDA";
  const entregas = "ENTREGAS";
  const agendaWidth = context.measureText(agenda).width;
  const badgeWidth = 116;
  const entregasWidth = context.measureText(entregas).width;
  const gap = 18;
  const totalWidth = agendaWidth + badgeWidth + entregasWidth + gap * 2;
  let x = width / 2 - totalWidth / 2;

  const whiteGradient = context.createLinearGradient(0, 22, 0, 88);
  whiteGradient.addColorStop(0, "#ffffff");
  whiteGradient.addColorStop(0.58, "#d9d9d9");
  whiteGradient.addColorStop(1, "#ffffff");
  context.fillStyle = whiteGradient;
  context.shadowColor = "rgba(255,255,255,0.3)";
  context.shadowBlur = 8;
  context.fillText(agenda, x, titleY);
  x += agendaWidth + gap;

  context.save();
  context.translate(x + badgeWidth / 2, 51);
  context.rotate(-0.11);
  context.strokeStyle = "#ff6a00";
  context.lineWidth = 5;
  drawRoundedRect(context, -badgeWidth / 2, -26, badgeWidth, 52, 8);
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "900 36px Arial Black, Arial";
  context.textAlign = "center";
  context.fillText("DE", 0, 13);
  context.restore();
  x += badgeWidth + gap;

  const orangeGradient = context.createLinearGradient(0, 22, 0, 88);
  orangeGradient.addColorStop(0, "#ff941f");
  orangeGradient.addColorStop(0.55, "#ff6a00");
  orangeGradient.addColorStop(1, "#d74700");
  context.fillStyle = orangeGradient;
  context.fillText(entregas, x, titleY);

  context.textAlign = "center";
  context.font = "900 64px Arial Black, Arial";
  context.fillStyle = whiteGradient;
  context.fillText("DA SEMANA", width / 2, 144);

  drawGearIcon(context, width / 2 - 250, 174, 16);
  context.fillStyle = "#ffffff";
  context.font = "900 30px Arial Black, Arial";
  context.fillText("CRONOGRAMA DE PRODUÇÃO", width / 2, 186);
  drawGlowLine(context, 60, width / 2 - 315, 168);
  drawGlowLine(context, width / 2 + 315, width - 60, 168);
  context.restore();
}

function drawDetailText(
  context: CanvasRenderingContext2D,
  row: WeeklyAgendaRow,
  x: number,
  y: number,
  maxWidth: number,
) {
  const detail = row.detail ? ` (${row.detail})` : "";
  let size = 30;

  for (; size >= 20; size -= 1) {
    context.font = `900 ${size}px Arial`;
    const clientWidth = context.measureText(row.client).width;
    context.font = `${size}px Arial`;
    const detailWidth = context.measureText(detail).width;
    if (clientWidth + detailWidth <= maxWidth) break;
  }

  context.font = `900 ${size}px Arial`;
  const client = truncateText(context, row.client, maxWidth * 0.72);
  context.fillStyle = "#f7f7f7";
  context.fillText(client, x, y);

  const clientWidth = context.measureText(client).width;
  context.font = `${size}px Arial`;
  context.fillStyle = "#eeeeee";
  context.fillText(truncateText(context, detail, maxWidth - clientWidth - 8), x + clientWidth + 8, y);
}

function drawSection(
  context: CanvasRenderingContext2D,
  title: string,
  rows: WeeklyAgendaRow[],
  y: number,
) {
  const x = 48;
  const width = 1440;
  const rowHeight = 62;
  const headerHeight = 58;
  const emptyRow: WeeklyAgendaRow = {
    date: "",
    client: "Sem entregas previstas",
    detail: "Nenhuma obra encontrada para este período",
    status: "-",
    tone: "gray",
  };
  const visibleRows = rows.length ? rows.slice(0, 4) : [emptyRow];
  const height = headerHeight + visibleRows.length * rowHeight + 18;
  const dateColumnWidth = 326;
  const statusColumnWidth = 414;
  const detailX = x + dateColumnWidth + 34;
  const detailMaxWidth = width - dateColumnWidth - statusColumnWidth - 76;

  context.save();
  context.shadowColor = "rgba(255,106,0,0.45)";
  context.shadowBlur = 8;
  context.strokeStyle = "rgba(255,255,255,0.72)";
  context.lineWidth = 2;
  drawRoundedRect(context, x, y, width, height, 13);
  context.stroke();
  context.shadowBlur = 0;

  const headerGradient = context.createLinearGradient(x, y, x, y + headerHeight);
  headerGradient.addColorStop(0, "rgba(255,255,255,0.08)");
  headerGradient.addColorStop(1, "rgba(255,255,255,0.01)");
  fillRoundedRect(context, x + 2, y + 2, width - 4, headerHeight, 10, headerGradient);

  const tabWidth = 390;
  const tabX = x + width / 2 - tabWidth / 2;
  const tabGradient = context.createLinearGradient(tabX, y + 4, tabX, y + headerHeight - 4);
  tabGradient.addColorStop(0, "#ff941f");
  tabGradient.addColorStop(0.55, "#ff6a00");
  tabGradient.addColorStop(1, "#d74700");
  context.fillStyle = tabGradient;
  context.beginPath();
  context.moveTo(tabX, y + 3);
  context.lineTo(tabX + tabWidth, y + 3);
  context.lineTo(tabX + tabWidth - 43, y + headerHeight - 5);
  context.lineTo(tabX + 43, y + headerHeight - 5);
  context.closePath();
  context.fill();
  context.fillStyle = "#111316";
  context.font = "900 34px Arial Black, Arial";
  context.textAlign = "center";
  context.fillText(title, x + width / 2, y + 42);

  drawCalendarIcon(context, x + 80, y + 14, 40);
  context.textAlign = "left";
  context.fillStyle = "#ffffff";
  context.font = "900 31px Arial Black, Arial";
  context.fillText("DATA", x + 140, y + 42);
  drawGearIcon(context, x + width - 310, y + 29, 16);
  context.fillText("STATUS", x + width - 260, y + 42);

  context.strokeStyle = "rgba(255,106,0,0.75)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x + dateColumnWidth, y + 22);
  context.lineTo(x + dateColumnWidth, y + height - 16);
  context.moveTo(x + width - statusColumnWidth, y + headerHeight);
  context.lineTo(x + width - statusColumnWidth, y + height - 16);
  context.stroke();

  visibleRows.forEach((row, index) => {
    const rowY = y + headerHeight + index * rowHeight;
    context.strokeStyle = "rgba(255,255,255,0.18)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, rowY);
    context.lineTo(x + width, rowY);
    context.stroke();

    drawCalendarIcon(context, x + 82, rowY + 13, 40);
    context.fillStyle = "#ffffff";
    context.font = "900 30px Arial";
    context.textAlign = "left";
    context.fillText(formatDate(row.date), x + 142, rowY + 43);
    drawDetailText(context, row, detailX, rowY + 43, detailMaxWidth);

    const theme = toneTheme(row.tone);
    drawStatusIcon(context, x + width - 356, rowY + 31, theme);
    const statusX = x + width - 294;
    const statusGradient = context.createLinearGradient(statusX, rowY + 10, statusX, rowY + 54);
    statusGradient.addColorStop(0, theme.start);
    statusGradient.addColorStop(0.55, theme.end);
    statusGradient.addColorStop(1, theme.start);
    context.shadowColor = theme.start;
    context.shadowBlur = 8;
    fillRoundedRect(context, statusX, rowY + 10, 240, 44, 6, statusGradient);
    context.shadowBlur = 0;
    context.fillStyle = "#ffffff";
    context.font = fitFont(context, row.status.toUpperCase(), 205, "900 24px Arial Black, Arial", 15);
    context.textAlign = "center";
    context.fillText(row.status.toUpperCase(), statusX + 120, rowY + 40);
  });

  context.restore();

  return y + height + 28;
}

function drawFooterLogo(context: CanvasRenderingContext2D, width: number, y: number) {
  context.save();
  drawGlowLine(context, 92, width / 2 - 270, y + 58);
  drawGlowLine(context, width / 2 + 270, width - 92, y + 58);

  context.textAlign = "center";
  context.font = "900 60px Arial Black, Arial";
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(255,255,255,0.35)";
  context.shadowBlur = 7;
  context.fillText("CONCEPT", width / 2 - 70, y + 42);
  context.fillStyle = "#ff6a00";
  context.fillText("21", width / 2 + 170, y + 42);
  context.shadowBlur = 0;
  context.fillStyle = "#ffffff";
  context.font = "28px Arial";
  context.fillText("A L U M Í N I O", width / 2, y + 82);
  context.restore();
}

export function WeeklyProductionAgendaImage({
  currentWeek,
  nextWeek,
}: WeeklyProductionAgendaImageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(context, canvas.width, canvas.height);
    drawTitle(context, canvas.width);

    const currentEndY = drawSection(context, "SEMANA ATUAL", currentWeek, 206);
    const nextEndY = drawSection(context, "PRÓXIMA SEMANA", nextWeek, currentEndY);
    drawFooterLogo(context, canvas.width, Math.max(878, Math.min(928, nextEndY + 20)));
  }, [currentWeek, nextWeek]);

  async function copyImage() {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.clipboard || !("ClipboardItem" in window)) {
      setMessage("Use baixar imagem neste navegador.");
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setMessage("Imagem copiada.");
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "agenda-entregas-semana.png";
    link.click();
  }

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-md border border-border bg-charcoal p-2">
        <canvas
          ref={canvasRef}
          width={1536}
          height={1024}
          className="h-auto w-full min-w-[760px] rounded bg-black"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadImage}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-charcoal px-3 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Download className="size-4" />
          Baixar imagem
        </button>
        <button
          type="button"
          onClick={copyImage}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted"
        >
          <ImageDown className="size-4" />
          Copiar imagem
        </button>
        {message ? <span className="text-sm font-medium text-success">{message}</span> : null}
      </div>
    </div>
  );
}
