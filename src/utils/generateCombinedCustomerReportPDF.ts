import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import logoImg from "@/assets/gaf-media-logo-full.png";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Payment {
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number?: string;
  notes?: string;
}

interface ReportInvoice {
  invoice_number: string;
  invoice_date: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  order?: {
    job_title: string;
    description: string;
    payments?: Payment[];
  };
  invoice_items: InvoiceItem[];
}

interface CustomerInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
}

interface CustomerReportData {
  customer: CustomerInfo;
  invoices: ReportInvoice[];
}

interface FilterOptions {
  dateFrom?: Date;
  dateTo?: Date;
  invoiceStatus?: string;
  minAmount?: string;
  maxAmount?: string;
}

export const generateCombinedCustomerReportPDF = (
  customersData: CustomerReportData[],
  filters: FilterOptions
) => {
  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Calculate grand totals
    let grandTotalBilled = 0;
    let grandTotalPaid = 0;
    let grandTotalInvoices = 0;

    customersData.forEach(({ invoices }) => {
      invoices.forEach((inv) => {
        grandTotalBilled += Number(inv.total_amount);
        grandTotalPaid += Number(inv.amount_paid);
        grandTotalInvoices++;
      });
    });

    const grandOutstanding = grandTotalBilled - grandTotalPaid;

    // Cover Page
    pdf.addImage(logoImg, "PNG", 70, 40, 70, 28);

    pdf.setFontSize(28);
    pdf.setTextColor(41, 98, 255);
    pdf.setFont(undefined, "bold");
    pdf.text("COMBINED CUSTOMER REPORT", 105, 90, { align: "center" });

    pdf.setFontSize(12);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text(`Generated: ${format(new Date(), "MMMM dd, yyyy")}`, 105, 102, { align: "center" });
    pdf.text(`Total Customers: ${customersData.length}`, 105, 110, { align: "center" });

    // Summary stats on cover
    let yPos = 130;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(30, yPos, 150, 50, 3, 3, "F");

    pdf.setFontSize(10);
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Invoices", 55, yPos + 12, { align: "center" });
    pdf.setFontSize(18);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(51, 51, 51);
    pdf.text(grandTotalInvoices.toString(), 55, yPos + 24, { align: "center" });

    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Billed", 105, yPos + 12, { align: "center" });
    pdf.setFontSize(18);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text(`$${grandTotalBilled.toFixed(2)}`, 105, yPos + 24, { align: "center" });

    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Paid", 155, yPos + 12, { align: "center" });
    pdf.setFontSize(18);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(34, 197, 94);
    pdf.text(`$${grandTotalPaid.toFixed(2)}`, 155, yPos + 24, { align: "center" });

    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Outstanding Balance", 105, yPos + 36, { align: "center" });
    pdf.setFontSize(18);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(239, 68, 68);
    pdf.text(`$${grandOutstanding.toFixed(2)}`, 105, yPos + 46, { align: "center" });

    // Filter info on cover
    if (filters.dateFrom || filters.dateTo || (filters.invoiceStatus && filters.invoiceStatus !== 'all')) {
      yPos = 195;
      pdf.setFontSize(9);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(102, 102, 102);
      pdf.text("Applied Filters:", 105, yPos, { align: "center" });
      
      pdf.setFont(undefined, "normal");
      let filterText = [];
      if (filters.dateFrom) filterText.push(`From: ${format(filters.dateFrom, "MMM dd, yyyy")}`);
      if (filters.dateTo) filterText.push(`To: ${format(filters.dateTo, "MMM dd, yyyy")}`);
      if (filters.invoiceStatus && filters.invoiceStatus !== 'all') filterText.push(`Status: ${filters.invoiceStatus}`);
      
      pdf.text(filterText.join(" | "), 105, yPos + 6, { align: "center" });
    }

    // Generate each customer's report
    customersData.forEach(({ customer, invoices }, customerIndex) => {
      pdf.addPage();

      // Customer header
      pdf.addImage(logoImg, "PNG", 20, 15, 50, 20);

      pdf.setFontSize(9);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, "bold");
      pdf.text("GAF MEDIA", 210 - 20, 20, { align: "right" });
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(102, 102, 102);
      pdf.text("Shanemo Shatrale Baidoa Somalia", 210 - 20, 25, { align: "right" });
      pdf.text("Phone: 0619130707", 210 - 20, 30, { align: "right" });
      pdf.text("Email: gafmedia02@gmail.com", 210 - 20, 35, { align: "right" });

      pdf.setDrawColor(230, 230, 230);
      pdf.setLineWidth(0.5);
      pdf.line(20, 42, 190, 42);

      // Customer title
      pdf.setFontSize(20);
      pdf.setTextColor(41, 98, 255);
      pdf.setFont(undefined, "bold");
      pdf.text(`Customer ${customerIndex + 1} of ${customersData.length}`, 20, 54);

      pdf.setFontSize(9);
      pdf.setTextColor(102, 102, 102);
      pdf.setFont(undefined, "normal");
      pdf.text(`Page ${customerIndex + 2}`, 210 - 20, 54, { align: "right" });

      // Customer info box
      yPos = 62;
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(20, yPos, 170, 30, 2, 2, "F");

      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(41, 98, 255);
      pdf.text("Customer Information", 25, yPos + 7);

      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      pdf.text(customer.name, 25, yPos + 15);

      let infoYPos = yPos + 21;
      pdf.setFontSize(9);
      pdf.setTextColor(102, 102, 102);
      if (customer.company_name) {
        pdf.text(`Company: ${customer.company_name}`, 25, infoYPos);
        infoYPos += 4;
      }
      if (customer.phone) {
        pdf.text(`Phone: ${customer.phone}`, 25, infoYPos);
      }
      if (customer.email) {
        pdf.text(`Email: ${customer.email}`, 100, yPos + 21);
      }

      // Customer totals
      const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
      const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0);
      const outstanding = totalBilled - totalPaid;

      yPos = 100;
      const statWidth = 40;
      const statHeight = 20;
      const statGap = 3;

      // Stats boxes
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(20, yPos, statWidth, statHeight, 2, 2, "F");
      pdf.setFontSize(8);
      pdf.setTextColor(102, 102, 102);
      pdf.text("Invoices", 40, yPos + 5, { align: "center" });
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(51, 51, 51);
      pdf.text(invoices.length.toString(), 40, yPos + 14, { align: "center" });

      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(20 + statWidth + statGap, yPos, statWidth, statHeight, 2, 2, "F");
      pdf.setFontSize(8);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(102, 102, 102);
      pdf.text("Billed", 40 + statWidth + statGap, yPos + 5, { align: "center" });
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(41, 98, 255);
      pdf.text(`$${totalBilled.toFixed(2)}`, 40 + statWidth + statGap, yPos + 14, { align: "center" });

      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(20 + (statWidth + statGap) * 2, yPos, statWidth, statHeight, 2, 2, "F");
      pdf.setFontSize(8);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(102, 102, 102);
      pdf.text("Paid", 40 + (statWidth + statGap) * 2, yPos + 5, { align: "center" });
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(34, 197, 94);
      pdf.text(`$${totalPaid.toFixed(2)}`, 40 + (statWidth + statGap) * 2, yPos + 14, { align: "center" });

      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(20 + (statWidth + statGap) * 3, yPos, statWidth, statHeight, 2, 2, "F");
      pdf.setFontSize(8);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(102, 102, 102);
      pdf.text("Outstanding", 40 + (statWidth + statGap) * 3, yPos + 5, { align: "center" });
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(239, 68, 68);
      pdf.text(`$${outstanding.toFixed(2)}`, 40 + (statWidth + statGap) * 3, yPos + 14, { align: "center" });

      // Invoices table
      yPos = 128;
      let currentY = yPos;

      invoices.forEach((invoice) => {
        if (currentY > 250) {
          pdf.addPage();
          currentY = 20;
        }

        autoTable(pdf, {
          startY: currentY,
          head: [["Invoice #", "Date", "Order", "Status", "Total", "Paid", "Balance"]],
          body: [[
            invoice.invoice_number,
            format(new Date(invoice.invoice_date), "MMM dd, yyyy"),
            invoice.order?.job_title || "N/A",
            invoice.status.toUpperCase(),
            `$${invoice.total_amount.toFixed(2)}`,
            `$${invoice.amount_paid.toFixed(2)}`,
            `$${(invoice.total_amount - invoice.amount_paid).toFixed(2)}`,
          ]],
          theme: "plain",
          styles: {
            fontSize: 8,
            cellPadding: 2,
            textColor: [51, 51, 51],
            lineColor: [230, 230, 230],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [41, 98, 255],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
          },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 25 },
            2: { cellWidth: 40 },
            3: { cellWidth: 20, halign: "center" },
            4: { cellWidth: 22, halign: "right" },
            5: { cellWidth: 22, halign: "right" },
            6: { cellWidth: 22, halign: "right" },
          },
          margin: { left: 20, right: 20 },
        });

        currentY = (pdf as any).lastAutoTable.finalY + 3;
      });
    });

    // Save PDF
    const filename = `Combined-Customer-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
    pdf.save(filename);

    return true;
  } catch (error) {
    console.error("Error generating combined customer report PDF:", error);
    throw error;
  }
};
