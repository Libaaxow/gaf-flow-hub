import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { REPORT_GREEN, REPORT_NAVY, REPORT_RED, addReportFooters, drawReportHeader, drawReportSummary, reportMoney, reportStatus, reportTableStyles } from "@/utils/reportPdfStyle";

export interface PdfAllocation { invoice_number: string; original_amount: number; previous_balance: number; allocated: number; remaining: number; status: string }
export interface PdfTransaction { payment_id: string; date: string; customer: string; method: string; received: number; allocated: number; unallocated: number; allocations: PdfAllocation[] }
export interface PdfSummary { periodLabel: string; totalReceived: number; paymentCount: number; totalAllocated: number; totalUnallocated: number; invoicesAffected: number; paidAllocations: number; partialAllocations: number; methodBreakdown: { method: string; amount: number }[] }

export const generatePaymentReportPDF = (summary: PdfSummary, transactions: PdfTransaction[]) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = drawReportHeader(pdf, "PAYMENT ALLOCATION REPORT", summary.periodLabel);
  y = drawReportSummary(pdf, y, [
    { label: "Received", value: reportMoney(summary.totalReceived), color: REPORT_GREEN },
    { label: "Allocated", value: reportMoney(summary.totalAllocated), color: REPORT_NAVY },
    { label: "Unallocated", value: reportMoney(summary.totalUnallocated), color: REPORT_RED },
    { label: "Payments / Invoices", value: `${summary.paymentCount} / ${summary.invoicesAffected}` },
  ]);
  if (summary.methodBreakdown.length) {
    autoTable(pdf, { startY: y, head: [["Payment method", "Amount"]], body: summary.methodBreakdown.map((item) => [reportStatus(item.method), reportMoney(item.amount)]), ...reportTableStyles, columnStyles: { 1: { halign: "right", fontStyle: "bold" } }, tableWidth: 90 });
    y = (pdf as any).lastAutoTable.finalY + 8;
  }
  transactions.forEach((transaction) => {
    if (y > 225) { pdf.addPage(); y = drawReportHeader(pdf, "PAYMENT ALLOCATION DETAIL", summary.periodLabel); }
    autoTable(pdf, { startY: y, head: [["Date", "Payment ID", "Customer", "Method", "Received", "Unallocated"]], body: [[transaction.date, transaction.payment_id, transaction.customer, reportStatus(transaction.method), reportMoney(transaction.received), reportMoney(transaction.unallocated)]], ...reportTableStyles, columnStyles: { 2: { cellWidth: 44 }, 4: { halign: "right", fontStyle: "bold" }, 5: { halign: "right" } } });
    y = (pdf as any).lastAutoTable.finalY;
    if (transaction.allocations.length) {
      autoTable(pdf, { startY: y, head: [["Invoice", "Original", "Before", "Allocated", "Remaining", "Status"]], body: transaction.allocations.map((item) => [item.invoice_number, reportMoney(item.original_amount), reportMoney(item.previous_balance), reportMoney(item.allocated), reportMoney(item.remaining), reportStatus(item.status)]), foot: [["Payment totals", "", "", reportMoney(transaction.allocated), "", ""]], ...reportTableStyles, footStyles: { fillColor: [248, 250, 252], textColor: REPORT_NAVY, fontStyle: "bold" }, columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" } } });
      y = (pdf as any).lastAutoTable.finalY + 7;
    } else y += 7;
  });
  addReportFooters(pdf, "Payment Allocation Report");
  pdf.save(`Payment-Allocation-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
};