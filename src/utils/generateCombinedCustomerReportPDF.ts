import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { REPORT_GREEN, REPORT_NAVY, REPORT_RED, addReportFooters, drawReportHeader, drawReportSummary, formatItemMeasure, reportMoney, reportStatus, reportTableStyles } from "@/utils/reportPdfStyle";

interface InvoiceItem { description: string; quantity: number; unit_price: number; amount: number; sale_type?: string; width_m?: number | null; height_m?: number | null; area_m2?: number | null; rate_per_m2?: number | null; products?: { name?: string } | null }
interface ReportInvoice { invoice_number: string; invoice_date: string; status: string; total_amount: number; amount_paid: number; invoice_items: InvoiceItem[] }
interface CustomerInfo { id: string; name: string; email?: string; phone?: string; company_name?: string }
interface CustomerReportData { customer: CustomerInfo; invoices: ReportInvoice[] }
interface FilterOptions { dateFrom?: Date; dateTo?: Date; invoiceStatus?: string; minAmount?: string; maxAmount?: string }

export const generateCombinedCustomerReportPDF = (customersData: CustomerReportData[], filters: FilterOptions) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const allInvoices = customersData.flatMap((row) => row.invoices);
  const billed = allInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
  const paid = allInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0);
  const filterText = [filters.dateFrom && `From ${format(filters.dateFrom, "dd MMM yyyy")}`, filters.dateTo && `To ${format(filters.dateTo, "dd MMM yyyy")}`, filters.invoiceStatus && filters.invoiceStatus !== "all" && reportStatus(filters.invoiceStatus)].filter(Boolean).join("  |  ");
  let y = drawReportHeader(pdf, "COMBINED CUSTOMER REPORT", filterText || "All matching customer records");
  y = drawReportSummary(pdf, y, [
    { label: "Customers", value: String(customersData.length) },
    { label: "Invoices", value: String(allInvoices.length) },
    { label: "Billed", value: reportMoney(billed), color: REPORT_NAVY },
    { label: "Outstanding", value: reportMoney(billed - paid), color: REPORT_RED },
  ]);

  customersData.forEach(({ customer, invoices }, customerIndex) => {
    if (customerIndex > 0 || y > 210) { pdf.addPage(); y = drawReportHeader(pdf, "CUSTOMER ACCOUNT DETAIL", `${customerIndex + 1} of ${customersData.length}`); }
    const customerBilled = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
    const customerPaid = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0);
    pdf.setFontSize(12); pdf.setFont(undefined, "bold"); pdf.setTextColor(...REPORT_NAVY); pdf.text(customer.name, 20, y);
    pdf.setFontSize(8); pdf.setFont(undefined, "normal"); pdf.setTextColor(100, 116, 139); pdf.text([customer.company_name, customer.phone, customer.email].filter(Boolean).join("  |  "), 20, y + 5);
    y = drawReportSummary(pdf, y + 10, [
      { label: "Invoices", value: String(invoices.length) },
      { label: "Billed", value: reportMoney(customerBilled), color: REPORT_NAVY },
      { label: "Paid", value: reportMoney(customerPaid), color: REPORT_GREEN },
      { label: "Balance", value: reportMoney(customerBilled - customerPaid), color: REPORT_RED },
    ]);
    invoices.forEach((invoice) => {
      if (y > 235) { pdf.addPage(); y = drawReportHeader(pdf, "CUSTOMER ACCOUNT DETAIL", customer.name); }
      autoTable(pdf, { startY: y, head: [["Invoice", "Date", "Status", "Total", "Paid", "Balance"]], body: [[invoice.invoice_number, format(new Date(invoice.invoice_date), "dd MMM yyyy"), reportStatus(invoice.status), reportMoney(invoice.total_amount), reportMoney(invoice.amount_paid), reportMoney(invoice.total_amount - invoice.amount_paid)]], ...reportTableStyles, columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } } });
      y = (pdf as any).lastAutoTable.finalY;
      if (invoice.invoice_items?.length) {
        autoTable(pdf, { startY: y, head: [["Description", "Qty / Size", "Rate", "Amount"]], body: invoice.invoice_items.map((item) => [item.products?.name ? `${item.products.name}\n${item.description || ""}` : item.description, formatItemMeasure(item), reportMoney(Number(item.rate_per_m2 || item.unit_price || 0)), reportMoney(item.amount)]), foot: [["Invoice total", "", "", reportMoney(invoice.total_amount)]], ...reportTableStyles, footStyles: { fillColor: [248, 250, 252], textColor: REPORT_NAVY, fontStyle: "bold" }, columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 40 }, 2: { cellWidth: 25, halign: "right" }, 3: { cellWidth: 27, halign: "right", fontStyle: "bold" } } });
        y = (pdf as any).lastAutoTable.finalY + 7;
      } else y += 7;
    });
  });
  addReportFooters(pdf, "Combined Customer Report");
  pdf.save(`Combined-Customer-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  return true;
};