import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  REPORT_GREEN,
  REPORT_NAVY,
  REPORT_RED,
  addReportFooters,
  drawReportHeader,
  drawReportSummary,
  formatItemMeasure,
  reportMoney,
  reportStatus,
  reportTableStyles,
} from "@/utils/reportPdfStyle";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sale_type?: string;
  width_m?: number | null;
  height_m?: number | null;
  area_m2?: number | null;
  rate_per_m2?: number | null;
  products?: { name?: string } | null;
}

interface ReportInvoice {
  invoice_number: string;
  invoice_date: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  invoice_items: InvoiceItem[];
}

interface CustomerInfo { name: string; email?: string; phone?: string; company_name?: string }
interface FilterOptions { dateFrom?: Date; dateTo?: Date; invoiceStatus?: string; minAmount?: string; maxAmount?: string }

const filtersLabel = (filters: FilterOptions) => {
  const parts: string[] = [];
  if (filters.dateFrom) parts.push(`From ${format(filters.dateFrom, "dd MMM yyyy")}`);
  if (filters.dateTo) parts.push(`To ${format(filters.dateTo, "dd MMM yyyy")}`);
  if (filters.invoiceStatus && filters.invoiceStatus !== "all") parts.push(`Status: ${reportStatus(filters.invoiceStatus)}`);
  return parts.join("  |  ") || "All matching invoice records";
};

export const generateCustomerReportPDF = (invoices: ReportInvoice[], customer: CustomerInfo, filters: FilterOptions) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const billed = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
  const paid = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0);
  const outstanding = billed - paid;
  let y = drawReportHeader(pdf, "CUSTOMER REPORT", filtersLabel(filters));

  pdf.setFontSize(11);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(...REPORT_NAVY);
  pdf.text(customer.name, 20, y);
  pdf.setFontSize(8);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(100, 116, 139);
  const contact = [customer.company_name, customer.phone, customer.email].filter(Boolean).join("  |  ");
  if (contact) pdf.text(contact, 20, y + 5);
  y = drawReportSummary(pdf, y + 10, [
    { label: "Invoices", value: String(invoices.length) },
    { label: "Billed", value: reportMoney(billed), color: REPORT_NAVY },
    { label: "Paid", value: reportMoney(paid), color: REPORT_GREEN },
    { label: "Outstanding", value: reportMoney(outstanding), color: REPORT_RED },
  ]);

  invoices.forEach((invoice) => {
    if (y > 235) { pdf.addPage(); y = drawReportHeader(pdf, "CUSTOMER REPORT", customer.name); }
    const balance = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);
    autoTable(pdf, {
      startY: y,
      head: [["Invoice", "Date", "Status", "Billed", "Paid", "Balance"]],
      body: [[invoice.invoice_number, format(new Date(invoice.invoice_date), "dd MMM yyyy"), reportStatus(invoice.status), reportMoney(invoice.total_amount), reportMoney(invoice.amount_paid), reportMoney(balance)]],
      ...reportTableStyles,
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 27 }, 2: { cellWidth: 28 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
    });
    y = (pdf as any).lastAutoTable.finalY;

    const items = invoice.invoice_items || [];
    if (items.length) {
      autoTable(pdf, {
        startY: y,
        head: [["Faah faahin / Description", "Tirada / Cabir", "Qiimaha / Rate", "Wadarta / Amount"]],
        body: items.map((item) => [
          item.products?.name ? `${item.products.name}${item.description && item.description !== item.products.name ? `\n${item.description}` : ""}` : item.description,
          formatItemMeasure(item),
          reportMoney(Number(item.rate_per_m2 || item.unit_price || 0)),
          reportMoney(item.amount),
        ]),
        foot: [["Invoice total", "", "", reportMoney(invoice.total_amount)]],
        ...reportTableStyles,
        headStyles: { ...reportTableStyles.headStyles, fillColor: REPORT_NAVY },
        footStyles: { fillColor: [248, 250, 252], textColor: REPORT_NAVY, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 40 }, 2: { cellWidth: 25, halign: "right" }, 3: { cellWidth: 27, halign: "right", fontStyle: "bold" } },
      });
      y = (pdf as any).lastAutoTable.finalY + 7;
    } else y += 7;
  });

  addReportFooters(pdf, "Customer Report");
  pdf.save(`Report-${customer.name.replace(/\s+/g, "-").substring(0, 24)}.pdf`);
  return true;
};