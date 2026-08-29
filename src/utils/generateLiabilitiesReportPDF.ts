import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import logoImg from "@/assets/gaf-media-logo-full.png";

export interface LiabilityItemRow {
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface LiabilityRow {
  id: string;
  title: string;
  vendor_name: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
  items?: LiabilityItemRow[];
}

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

const drawHeader = (pdf: jsPDF, title: string) => {
  pdf.addImage(logoImg, "PNG", 20, 15, 50, 20);

  pdf.setFontSize(9);
  pdf.setTextColor(51, 51, 51);
  pdf.setFont(undefined, "bold");
  pdf.text("GAF MEDIA", 190, 20, { align: "right" });
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Shanemo Shatrale Baidoa Somalia", 190, 25, { align: "right" });
  pdf.text("Phone: 0619130707", 190, 30, { align: "right" });
  pdf.text("Email: gafmedia02@gmail.com", 190, 35, { align: "right" });

  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.5);
  pdf.line(20, 42, 190, 42);

  pdf.setFontSize(20);
  pdf.setTextColor(218, 34, 39);
  pdf.setFont(undefined, "bold");
  pdf.text(title, 20, 54);

  pdf.setFontSize(9);
  pdf.setTextColor(102, 102, 102);
  pdf.setFont(undefined, "normal");
  pdf.text(`Generated: ${format(new Date(), "MMMM dd, yyyy")}`, 190, 54, { align: "right" });
};

const drawFooter = (pdf: jsPDF) => {
  const footerY = 280;
  pdf.setDrawColor(230, 230, 230);
  pdf.line(20, footerY - 5, 190, footerY - 5);
  pdf.setFontSize(8);
  pdf.setTextColor(102, 102, 102);
  pdf.setFont(undefined, "normal");
  pdf.text("GAF Media Internal Report", 105, footerY, { align: "center" });
};

/** Detailed report for ONE liability with its itemized breakdown. */
export const generateLiabilityPDF = (liability: LiabilityRow) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawHeader(pdf, "LIABILITY STATEMENT");

  const remaining = Math.max(0, (liability.amount || 0) - (liability.paid_amount || 0));

  let y = 64;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(20, y, 170, 30, 2, 2, "F");
  pdf.setFontSize(11);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(51, 51, 51);
  pdf.text(liability.title, 25, y + 8);
  pdf.setFontSize(9);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text(`Vendor: ${liability.vendor_name || "-"}`, 25, y + 16);
  pdf.text(`Due Date: ${liability.due_date || "-"}`, 25, y + 23);
  pdf.text(`Status: ${(liability.status || "").replace("_", " ").toUpperCase()}`, 120, y + 16);
  pdf.text(`Paid: ${money(liability.paid_amount)}`, 120, y + 23);

  y += 40;

  const items = liability.items || [];
  if (items.length > 0) {
    autoTable(pdf, {
      startY: y,
      head: [["#", "Item", "Qty", "Unit Price", "Total"]],
      body: items.map((it, i) => [
        String(i + 1),
        it.item_name,
        String(it.quantity),
        money(it.unit_price),
        money(it.line_total),
      ]),
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 3, textColor: [51, 51, 51], lineColor: [230, 230, 230], lineWidth: 0.1 },
      headStyles: { fillColor: [218, 34, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 80 },
        2: { cellWidth: 20, halign: "right" },
        3: { cellWidth: 29, halign: "right" },
        4: { cellWidth: 29, halign: "right", fontStyle: "bold" },
      },
      margin: { left: 20, right: 20 },
    });
    y = (pdf as any).lastAutoTable.finalY + 10;
  } else {
    pdf.setFontSize(9);
    pdf.setTextColor(102, 102, 102);
    pdf.text("No itemized breakdown recorded for this liability.", 20, y);
    y += 10;
  }

  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(110, y, 80, 26, 2, 2, "F");
  pdf.setFontSize(9);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Total Amount:", 115, y + 8);
  pdf.text(money(liability.amount), 185, y + 8, { align: "right" });
  pdf.text("Paid Amount:", 115, y + 15);
  pdf.text(money(liability.paid_amount), 185, y + 15, { align: "right" });
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(218, 34, 39);
  pdf.text("Remaining:", 115, y + 22);
  pdf.text(money(remaining), 185, y + 22, { align: "right" });

  drawFooter(pdf);
  pdf.save(`Liability-${liability.title.replace(/[^a-z0-9]+/gi, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  return true;
};

/** Summary report of ALL liabilities, with item breakdowns beneath each. */
export const generateLiabilitiesReportPDF = (liabilities: LiabilityRow[]) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawHeader(pdf, "LIABILITIES REPORT");

  const total = liabilities.reduce((s, l) => s + Number(l.amount || 0), 0);
  const paid = liabilities.reduce((s, l) => s + Number(l.paid_amount || 0), 0);
  const outstanding = liabilities.reduce(
    (s, l) => s + Math.max(0, Number(l.amount || 0) - Number(l.paid_amount || 0)),
    0
  );

  let y = 64;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(20, y, 170, 22, 2, 2, "F");
  pdf.setFontSize(10);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(51, 51, 51);
  pdf.text(`Records: ${liabilities.length}`, 25, y + 9);
  pdf.text(`Total: ${money(total)}`, 70, y + 9);
  pdf.text(`Paid: ${money(paid)}`, 120, y + 9);
  pdf.setTextColor(218, 34, 39);
  pdf.text(`Outstanding: ${money(outstanding)}`, 25, y + 17);

  y += 30;

  autoTable(pdf, {
    startY: y,
    head: [["Title", "Vendor", "Total", "Paid", "Remaining", "Due", "Status"]],
    body: liabilities.map((l) => [
      l.title,
      l.vendor_name || "-",
      money(l.amount),
      money(l.paid_amount),
      money(Math.max(0, Number(l.amount || 0) - Number(l.paid_amount || 0))),
      l.due_date || "-",
      (l.status || "").replace("_", " ").toUpperCase(),
    ]),
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 3, textColor: [51, 51, 51], lineColor: [230, 230, 230], lineWidth: 0.1 },
    headStyles: { fillColor: [218, 34, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [252, 252, 253] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 20, right: 20 },
  });

  y = (pdf as any).lastAutoTable.finalY + 10;

  const withItems = liabilities.filter((l) => (l.items || []).length > 0);
  if (withItems.length > 0) {
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(218, 34, 39);
    if (y > 240) { pdf.addPage(); y = 25; }
    pdf.text("Itemized Breakdown", 20, y);
    y += 6;

    withItems.forEach((l) => {
      if (y > 240) { pdf.addPage(); y = 25; }
      pdf.setFontSize(9);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(51, 51, 51);
      pdf.text(`${l.title}${l.vendor_name ? ` — ${l.vendor_name}` : ""}`, 20, y);
      y += 3;

      autoTable(pdf, {
        startY: y,
        head: [["Item", "Qty", "Unit Price", "Total"]],
        body: (l.items || []).map((it) => [
          it.item_name,
          String(it.quantity),
          money(it.unit_price),
          money(it.line_total),
        ]),
        theme: "plain",
        styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 51, 51], lineColor: [235, 235, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [57, 61, 140], textColor: [255, 255, 255], fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 20, halign: "right" },
          2: { cellWidth: 30, halign: "right" },
          3: { cellWidth: 30, halign: "right", fontStyle: "bold" },
        },
        margin: { left: 20, right: 20 },
      });
      y = (pdf as any).lastAutoTable.finalY + 8;
    });
  }

  drawFooter(pdf);
  pdf.save(`Liabilities-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  return true;
};
