import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { REPORT_GREEN, REPORT_NAVY, REPORT_RED, addReportFooters, drawReportHeader, drawReportSummary, reportMoney, reportStatus, reportTableStyles } from "@/utils/reportPdfStyle";

export interface LiabilityItemRow { item_name: string; quantity: number; unit_price: number; line_total: number }
export interface LiabilityRow { id: string; title: string; vendor_name: string | null; amount: number; paid_amount: number; due_date: string | null; status: string; items?: LiabilityItemRow[] }

const drawLiabilityDetail = (pdf: jsPDF, liability: LiabilityRow, startY: number) => {
  let y = startY;
  const remaining = Math.max(0, Number(liability.amount || 0) - Number(liability.paid_amount || 0));
  autoTable(pdf, { startY: y, head: [["Liability", "Vendor", "Due date", "Status", "Total", "Paid", "Remaining"]], body: [[liability.title, liability.vendor_name || "—", liability.due_date || "—", reportStatus(liability.status), reportMoney(liability.amount), reportMoney(liability.paid_amount), reportMoney(remaining)]], ...reportTableStyles, columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 34 }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right", fontStyle: "bold" } } });
  y = (pdf as any).lastAutoTable.finalY;
  if (liability.items?.length) {
    autoTable(pdf, { startY: y, head: [["Description", "Quantity", "Unit rate", "Amount"]], body: liability.items.map((item) => [item.item_name, String(item.quantity), reportMoney(item.unit_price), reportMoney(item.line_total)]), foot: [["Item total", "", "", reportMoney(liability.items.reduce((sum, item) => sum + Number(item.line_total || 0), 0))]], ...reportTableStyles, footStyles: { fillColor: [248, 250, 252], textColor: REPORT_NAVY, fontStyle: "bold" }, columnStyles: { 0: { cellWidth: 90 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } } });
    y = (pdf as any).lastAutoTable.finalY;
  }
  return y + 8;
};

export const generateLiabilityPDF = (liability: LiabilityRow) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = drawReportHeader(pdf, "LIABILITY STATEMENT", liability.vendor_name || "Recorded payable");
  y = drawReportSummary(pdf, y, [{ label: "Total", value: reportMoney(liability.amount), color: REPORT_NAVY }, { label: "Paid", value: reportMoney(liability.paid_amount), color: REPORT_GREEN }, { label: "Remaining", value: reportMoney(Math.max(0, liability.amount - liability.paid_amount)), color: REPORT_RED }, { label: "Status", value: reportStatus(liability.status) }]);
  drawLiabilityDetail(pdf, liability, y);
  addReportFooters(pdf, "Liability Statement");
  pdf.save(`Liability-${liability.title.replace(/[^a-z0-9]+/gi, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  return true;
};

export const generateLiabilitiesReportPDF = (liabilities: LiabilityRow[]) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const total = liabilities.reduce((sum, liability) => sum + Number(liability.amount || 0), 0);
  const paid = liabilities.reduce((sum, liability) => sum + Number(liability.paid_amount || 0), 0);
  let y = drawReportHeader(pdf, "LIABILITIES REPORT", "Detailed payable balances and item breakdowns");
  y = drawReportSummary(pdf, y, [{ label: "Records", value: String(liabilities.length) }, { label: "Total", value: reportMoney(total), color: REPORT_NAVY }, { label: "Paid", value: reportMoney(paid), color: REPORT_GREEN }, { label: "Outstanding", value: reportMoney(total - paid), color: REPORT_RED }]);
  liabilities.forEach((liability) => { if (y > 220) { pdf.addPage(); y = drawReportHeader(pdf, "LIABILITY DETAIL", liability.vendor_name || "Recorded payable"); } y = drawLiabilityDetail(pdf, liability, y); });
  addReportFooters(pdf, "Liabilities Report");
  pdf.save(`Liabilities-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  return true;
};