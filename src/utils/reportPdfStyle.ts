import jsPDF from "jspdf";
import { format } from "date-fns";
import logoImg from "@/assets/gaf-media-logo-full.png";

export const REPORT_NAVY: [number, number, number] = [57, 61, 140];
export const REPORT_RED: [number, number, number] = [218, 34, 39];
export const REPORT_GREEN: [number, number, number] = [22, 163, 74];
export const REPORT_AMBER: [number, number, number] = [217, 119, 6];
export const REPORT_TEXT: [number, number, number] = [30, 41, 59];
export const REPORT_MUTED: [number, number, number] = [100, 116, 139];
export const REPORT_LINE: [number, number, number] = [226, 232, 240];
export const REPORT_SURFACE: [number, number, number] = [248, 250, 252];

export const reportMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const reportStatus = (value: string) =>
  String(value || "N/A").replace(/_/g, " ").toUpperCase();

export const drawReportHeader = (
  pdf: jsPDF,
  title: string,
  subtitle?: string,
) => {
  try {
    pdf.addImage(logoImg, "PNG", 20, 12, 45, 18);
  } catch {
    // The report remains usable when the logo cannot be decoded.
  }

  pdf.setFontSize(9);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(...REPORT_TEXT);
  pdf.text("GAF MEDIA", 190, 16, { align: "right" });
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(...REPORT_MUTED);
  pdf.text("Shanemo Shatrale, Baidoa, Somalia", 190, 21, { align: "right" });
  pdf.text("Hormuud 0619130707  |  Somtel 0629130707", 190, 26, { align: "right" });
  pdf.text("gafmedia02@gmail.com  |  www.gafsom.com", 190, 31, { align: "right" });

  pdf.setDrawColor(...REPORT_LINE);
  pdf.setLineWidth(0.35);
  pdf.line(20, 36, 190, 36);

  pdf.setFontSize(17);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(...REPORT_NAVY);
  pdf.text(title, 20, 47);
  pdf.setFontSize(8.5);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(...REPORT_MUTED);
  if (subtitle) pdf.text(subtitle, 20, 53);
  pdf.text(`Generated ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 190, 53, { align: "right" });
  return 61;
};

export const addReportFooters = (pdf: jsPDF, label: string) => {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...REPORT_LINE);
    pdf.setLineWidth(0.25);
    pdf.line(20, 283, 190, 283);
    pdf.setFontSize(7.5);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(...REPORT_MUTED);
    pdf.text(`GAF MEDIA — ${label}`, 20, 288);
    pdf.text(`Page ${page} of ${pages}`, 190, 288, { align: "right" });
  }
};

export const reportTableStyles = {
  theme: "plain" as const,
  styles: {
    fontSize: 8,
    cellPadding: 2.4,
    textColor: REPORT_TEXT,
    lineColor: REPORT_LINE,
    lineWidth: 0.12,
    overflow: "linebreak" as const,
    valign: "middle" as const,
  },
  headStyles: {
    fillColor: REPORT_NAVY,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 8,
    cellPadding: 2.6,
  },
  alternateRowStyles: { fillColor: [252, 252, 253] as [number, number, number] },
  margin: { left: 20, right: 20, bottom: 18 },
};

export const drawReportSummary = (
  pdf: jsPDF,
  y: number,
  items: { label: string; value: string; color?: [number, number, number] }[],
) => {
  const columns = Math.min(4, Math.max(1, items.length));
  const gap = 3;
  const width = (170 - gap * (columns - 1)) / columns;
  const rows = Math.ceil(items.length / columns);
  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 20 + column * (width + gap);
    const top = y + row * 22;
    pdf.setFillColor(...REPORT_SURFACE);
    pdf.setDrawColor(...REPORT_LINE);
    pdf.roundedRect(x, top, width, 18, 1.5, 1.5, "FD");
    pdf.setFontSize(7);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(...REPORT_MUTED);
    pdf.text(item.label.toUpperCase(), x + 3, top + 6);
    pdf.setFontSize(10.5);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(...(item.color || REPORT_TEXT));
    pdf.text(item.value, x + 3, top + 13.5);
  });
  return y + rows * 22 + 2;
};

export const formatItemMeasure = (item: {
  quantity?: number;
  sale_type?: string;
  width_m?: number | null;
  height_m?: number | null;
  area_m2?: number | null;
}) => {
  const quantity = Number(item.quantity || 0);
  const width = Number(item.width_m || 0);
  const height = Number(item.height_m || 0);
  const area = Number(item.area_m2 || (width > 0 && height > 0 ? width * height * Math.max(quantity, 1) : 0));
  const isArea = item.sale_type === "area" || area > 0;
  if (!isArea) return `${quantity || 1} pcs`;
  if (width > 0 && height > 0) {
    return `${quantity || 1} × ${width.toFixed(2)} × ${height.toFixed(2)} m\n${area.toFixed(2)} m² total`;
  }
  return `${area.toFixed(2)} m²`;
};