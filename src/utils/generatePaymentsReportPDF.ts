import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { REPORT_GREEN, REPORT_NAVY, REPORT_RED, addReportFooters, drawReportHeader, drawReportSummary, reportMoney, reportStatus, reportTableStyles } from "@/utils/reportPdfStyle";

interface Payment { amount: number; payment_method: string; payment_date: string; reference_number?: string; notes?: string; discount_amount?: number; discount_type?: string; discount_reason?: string; order: { job_title: string; customer: { name: string } } | null; invoice?: { invoice_number: string; customer: { name: string } } | null }
interface FilterOptions { dateFrom?: Date; dateTo?: Date; paymentMethod?: string }

export const generatePaymentsReportPDF = (payments: Payment[], filters: FilterOptions) => {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const discounts = payments.reduce((sum, payment) => sum + Number(payment.discount_amount || 0), 0);
  const methods = new Set(payments.map((payment) => payment.payment_method));
  const filterText = [filters.dateFrom && `From ${format(filters.dateFrom, "dd MMM yyyy")}`, filters.dateTo && `To ${format(filters.dateTo, "dd MMM yyyy")}`, filters.paymentMethod && filters.paymentMethod !== "all" && `Method: ${reportStatus(filters.paymentMethod)}`].filter(Boolean).join("  |  ");
  let y = drawReportHeader(pdf, "PAYMENTS REPORT", filterText || "All matching payment records");
  y = drawReportSummary(pdf, y, [{ label: "Payments", value: String(payments.length) }, { label: "Received", value: reportMoney(total), color: REPORT_GREEN }, { label: "Discounts", value: reportMoney(discounts), color: REPORT_RED }, { label: "Methods", value: String(methods.size), color: REPORT_NAVY }]);
  autoTable(pdf, {
    startY: y,
    head: [["Date", "Customer", "Order / Invoice", "Method", "Reference", "Notes / Discount reason", "Received", "Discount"]],
    body: payments.map((payment) => [format(new Date(payment.payment_date), "dd MMM yyyy"), payment.order?.customer?.name || payment.invoice?.customer?.name || "N/A", payment.order?.job_title || payment.invoice?.invoice_number || "N/A", reportStatus(payment.payment_method), payment.reference_number || "—", [payment.notes, payment.discount_reason].filter(Boolean).join("\n") || "—", reportMoney(payment.amount), payment.discount_amount ? reportMoney(payment.discount_amount) : "—"]),
    foot: [["Grand total", "", "", "", "", "", reportMoney(total), reportMoney(discounts)]],
    ...reportTableStyles,
    footStyles: { fillColor: [248, 250, 252], textColor: REPORT_NAVY, fontStyle: "bold" },
    columnStyles: { 1: { cellWidth: 42 }, 2: { cellWidth: 46 }, 5: { cellWidth: 55 }, 6: { halign: "right", fontStyle: "bold" }, 7: { halign: "right" } },
  });
  addReportFooters(pdf, "Payments Report");
  pdf.save(`Payments-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  return true;
};