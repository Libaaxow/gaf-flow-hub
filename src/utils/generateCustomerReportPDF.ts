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
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
}

interface FilterOptions {
  dateFrom?: Date;
  dateTo?: Date;
  invoiceStatus?: string;
  minAmount?: string;
  maxAmount?: string;
}

export const generateCustomerReportPDF = (
  invoices: ReportInvoice[],
  customer: CustomerInfo,
  filters: FilterOptions
) => {
  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true, // Enable compression for smaller file size
    });

    // Add company logo - reduced size for smaller file
    pdf.addImage(logoImg, "JPEG", 20, 15, 40, 16, undefined, "FAST");

    // Company Details - Right aligned
    pdf.setFontSize(8);
    pdf.setTextColor(51, 51, 51);
    pdf.setFont(undefined, "bold");
    pdf.text("GAF MEDIA", 210 - 20, 18, { align: "right" });
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Baidoa, Somalia | 0619130707", 210 - 20, 23, { align: "right" });

    // Separator line
    pdf.setDrawColor(230, 230, 230);
    pdf.setLineWidth(0.3);
    pdf.line(20, 35, 190, 35);

    // Report Title
    pdf.setFontSize(18);
    pdf.setTextColor(41, 98, 255);
    pdf.setFont(undefined, "bold");
    pdf.text("CUSTOMER REPORT", 20, 45);

    // Report Date
    pdf.setFontSize(8);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text(`${format(new Date(), "dd MMM yyyy")}`, 210 - 20, 45, { align: "right" });

    // Customer Summary Section - compact
    let yPos = 52;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, yPos, 170, 22, 1, 1, "F");

    pdf.setFontSize(10);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text("Customer: " + customer.name, 25, yPos + 6);

    pdf.setFontSize(8);
    pdf.setTextColor(51, 51, 51);
    pdf.setFont(undefined, "normal");
    let infoText = [];
    if (customer.company_name) infoText.push(customer.company_name);
    if (customer.phone) infoText.push(customer.phone);
    if (customer.email) infoText.push(customer.email);
    pdf.text(infoText.join(" | ").substring(0, 80), 25, yPos + 12);

    // Calculate totals
    const totalInvoices = invoices.length;
    const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0);
    const outstanding = totalBilled - totalPaid;

    // Compact stats on same line
    pdf.setFontSize(7);
    pdf.text(`Invoices: ${totalInvoices}  |  Billed: $${totalBilled.toFixed(2)}  |  Paid: $${totalPaid.toFixed(2)}  |  Outstanding: $${outstanding.toFixed(2)}`, 25, yPos + 18);

    yPos = 78;

    // Filter Information (if any filters applied) - compact
    if (filters.dateFrom || filters.dateTo || (filters.invoiceStatus && filters.invoiceStatus !== 'all')) {
      pdf.setFontSize(7);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(102, 102, 102);
      let filterText = ["Filters:"];
      if (filters.dateFrom) filterText.push(`From: ${format(filters.dateFrom, "dd/MM/yy")}`);
      if (filters.dateTo) filterText.push(`To: ${format(filters.dateTo, "dd/MM/yy")}`);
      if (filters.invoiceStatus && filters.invoiceStatus !== 'all') filterText.push(`Status: ${filters.invoiceStatus}`);
      pdf.text(filterText.join(" "), 20, yPos);
      yPos += 5;
    }

    // Invoice Table Header
    pdf.setFontSize(9);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text("Invoice Details", 20, yPos);
    yPos += 4;

    // Generate detailed invoice tables with items
    let currentY = yPos;
    
    invoices.forEach((invoice) => {
      // Check if we need a new page
      if (currentY > 250) {
        pdf.addPage();
        currentY = 15;
      }

      // Compact invoice header
      autoTable(pdf, {
        startY: currentY,
        head: [["Invoice#", "Date", "Status", "Total", "Paid", "Due"]],
        body: [[
          invoice.invoice_number,
          format(new Date(invoice.invoice_date), "dd/MM/yy"),
          invoice.status.toUpperCase(),
          `$${invoice.total_amount.toFixed(2)}`,
          `$${invoice.amount_paid.toFixed(2)}`,
          `$${(invoice.total_amount - invoice.amount_paid).toFixed(2)}`,
        ]],
        theme: "plain",
        styles: {
          fontSize: 7,
          cellPadding: 2,
          textColor: [51, 51, 51],
          lineColor: [230, 230, 230],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [41, 98, 255],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 6,
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 22 },
          2: { cellWidth: 22, halign: "center" },
          3: { cellWidth: 28, halign: "right" },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 28, halign: "right" },
        },
        margin: { left: 20, right: 20 },
      });

      currentY = (pdf as any).lastAutoTable.finalY;

      // Invoice items table - compact
      if (invoice.invoice_items && invoice.invoice_items.length > 0) {
        const itemsData = invoice.invoice_items.map((item) => [
          item.description.substring(0, 35),
          item.quantity.toString(),
          `$${item.unit_price.toFixed(2)}`,
          `$${item.amount.toFixed(2)}`,
        ]);

        autoTable(pdf, {
          startY: currentY,
          head: [["Description", "Qty", "Price", "Amount"]],
          body: itemsData,
          theme: "plain",
          styles: {
            fontSize: 6,
            cellPadding: 1.5,
            textColor: [51, 51, 51],
            lineColor: [230, 230, 230],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [248, 250, 252],
            textColor: [102, 102, 102],
            fontStyle: "bold",
            fontSize: 6,
            cellPadding: 1.5,
          },
          columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 15, halign: "center" },
            2: { cellWidth: 25, halign: "right" },
            3: { cellWidth: 25, halign: "right" },
          },
          margin: { left: 20, right: 20 },
        });

        currentY = (pdf as any).lastAutoTable.finalY;
      }

      currentY += 3;
    });

    // Compact summary at bottom
    let finalY = (pdf as any).lastAutoTable.finalY + 5;
    
    if (finalY > 260) {
      pdf.addPage();
      finalY = 15;
    }
    
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(120, finalY, 70, 18, 1, 1, "F");

    pdf.setFontSize(7);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Billed:", 125, finalY + 5);
    pdf.text(`$${totalBilled.toFixed(2)}`, 185, finalY + 5, { align: "right" });

    pdf.setTextColor(34, 197, 94);
    pdf.text("Paid:", 125, finalY + 10);
    pdf.text(`$${totalPaid.toFixed(2)}`, 185, finalY + 10, { align: "right" });

    pdf.setFont(undefined, "bold");
    pdf.setTextColor(239, 68, 68);
    pdf.text("Outstanding:", 125, finalY + 15);
    pdf.text(`$${outstanding.toFixed(2)}`, 185, finalY + 15, { align: "right" });

    // Save PDF with short filename
    const filename = `Report-${customer.name.replace(/\s+/g, "-").substring(0, 15)}.pdf`;
    pdf.save(filename);

    return true;
  } catch (error) {
    console.error("Error generating customer report PDF:", error);
    throw error;
  }
};
