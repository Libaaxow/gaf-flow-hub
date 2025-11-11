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
    });

    // Add company logo
    pdf.addImage(logoImg, "PNG", 20, 15, 50, 20);

    // Company Details - Right aligned
    pdf.setFontSize(9);
    pdf.setTextColor(51, 51, 51);
    pdf.setFont(undefined, "bold");
    pdf.text("GAF MEDIA", 210 - 20, 20, { align: "right" });
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Shanemo Shatrale Baidoa Somalia", 210 - 20, 25, { align: "right" });
    pdf.text("Phone: 0619130707", 210 - 20, 30, { align: "right" });
    pdf.text("Email: gafmedia02@gmail.com", 210 - 20, 35, { align: "right" });

    // Separator line
    pdf.setDrawColor(230, 230, 230);
    pdf.setLineWidth(0.5);
    pdf.line(20, 42, 190, 42);

    // Report Title
    pdf.setFontSize(24);
    pdf.setTextColor(41, 98, 255);
    pdf.setFont(undefined, "bold");
    pdf.text("CUSTOMER REPORT", 20, 54);

    // Report Date
    pdf.setFontSize(9);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text(`Generated: ${format(new Date(), "MMMM dd, yyyy")}`, 210 - 20, 54, { align: "right" });

    // Customer Summary Section
    let yPos = 65;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, yPos, 170, 35, 2, 2, "F");

    pdf.setFontSize(12);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text("Customer Information", 25, yPos + 7);

    pdf.setFontSize(10);
    pdf.setTextColor(51, 51, 51);
    pdf.text(customer.name, 25, yPos + 15);

    let infoYPos = yPos + 21;
    if (customer.company_name) {
      pdf.setFontSize(9);
      pdf.setTextColor(102, 102, 102);
      pdf.text(`Company: ${customer.company_name}`, 25, infoYPos);
      infoYPos += 5;
    }
    if (customer.email) {
      pdf.setFontSize(9);
      pdf.text(`Email: ${customer.email}`, 25, infoYPos);
      infoYPos += 5;
    }
    if (customer.phone) {
      pdf.setFontSize(9);
      pdf.text(`Phone: ${customer.phone}`, 25, infoYPos);
    }

    // Calculate totals
    const totalInvoices = invoices.length;
    const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0);
    const outstanding = totalBilled - totalPaid;

    // Statistics Section
    yPos = 108;
    const statWidth = 40;
    const statHeight = 22;
    const statGap = 3;
    
    // Total Invoices
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, yPos, statWidth, statHeight, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Invoices", 40, yPos + 6, { align: "center" });
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(51, 51, 51);
    pdf.text(totalInvoices.toString(), 40, yPos + 15, { align: "center" });

    // Total Billed
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20 + statWidth + statGap, yPos, statWidth, statHeight, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Billed", 40 + statWidth + statGap, yPos + 6, { align: "center" });
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text(`$${totalBilled.toFixed(2)}`, 40 + statWidth + statGap, yPos + 15, { align: "center" });

    // Total Paid
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20 + (statWidth + statGap) * 2, yPos, statWidth, statHeight, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Paid", 40 + (statWidth + statGap) * 2, yPos + 6, { align: "center" });
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(34, 197, 94);
    pdf.text(`$${totalPaid.toFixed(2)}`, 40 + (statWidth + statGap) * 2, yPos + 15, { align: "center" });

    // Outstanding
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20 + (statWidth + statGap) * 3, yPos, statWidth, statHeight, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Outstanding", 40 + (statWidth + statGap) * 3, yPos + 6, { align: "center" });
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(239, 68, 68);
    pdf.text(`$${outstanding.toFixed(2)}`, 40 + (statWidth + statGap) * 3, yPos + 15, { align: "center" });

    // Filter Information (if any filters applied)
    yPos = 138;
    if (filters.dateFrom || filters.dateTo || (filters.invoiceStatus && filters.invoiceStatus !== 'all')) {
      pdf.setFontSize(9);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(102, 102, 102);
      pdf.text("Applied Filters:", 20, yPos);
      
      pdf.setFont(undefined, "normal");
      let filterText = [];
      if (filters.dateFrom) filterText.push(`From: ${format(filters.dateFrom, "MMM dd, yyyy")}`);
      if (filters.dateTo) filterText.push(`To: ${format(filters.dateTo, "MMM dd, yyyy")}`);
      if (filters.invoiceStatus && filters.invoiceStatus !== 'all') filterText.push(`Status: ${filters.invoiceStatus}`);
      
      pdf.text(filterText.join(" | "), 50, yPos);
      yPos += 8;
    }

    // Invoice Table Header
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text("Invoice Details", 20, yPos);

    yPos += 5;

    // Generate detailed invoice tables with items
    let currentY = yPos;
    
    invoices.forEach((invoice, index) => {
      // Check if we need a new page
      if (currentY > 240) {
        pdf.addPage();
        currentY = 20;
      }

      // Invoice header table
      autoTable(pdf, {
        startY: currentY,
        head: [["Invoice #", "Date", "Order", "Status", "Total"]],
        body: [[
          invoice.invoice_number,
          format(new Date(invoice.invoice_date), "MMM dd, yyyy"),
          invoice.order?.job_title || "N/A",
          invoice.status.toUpperCase(),
          `$${invoice.total_amount.toFixed(2)}`,
        ]],
        theme: "plain",
        styles: {
          fontSize: 8,
          cellPadding: 3,
          textColor: [51, 51, 51],
          lineColor: [230, 230, 230],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [41, 98, 255],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: 4,
        },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 35 },
          2: { cellWidth: 50 },
          3: { cellWidth: 25, halign: "center" },
          4: { cellWidth: 25, halign: "right" },
        },
      });

      currentY = (pdf as any).lastAutoTable.finalY;

      // Invoice items table
      if (invoice.invoice_items && invoice.invoice_items.length > 0) {
        const itemsData = invoice.invoice_items.map((item) => [
          item.description,
          item.quantity.toString(),
          `$${item.unit_price.toFixed(2)}`,
          `$${item.amount.toFixed(2)}`,
        ]);

        autoTable(pdf, {
          startY: currentY,
          head: [["Description", "Qty", "Unit Price", "Amount"]],
          body: itemsData,
          theme: "plain",
          styles: {
            fontSize: 8,
            cellPadding: 3,
            textColor: [51, 51, 51],
            lineColor: [230, 230, 230],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [248, 250, 252],
            textColor: [102, 102, 102],
            fontStyle: "bold",
            fontSize: 8,
            cellPadding: 3,
          },
          alternateRowStyles: {
            fillColor: [252, 252, 253],
          },
          columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 20, halign: "center" },
            2: { cellWidth: 30, halign: "right" },
            3: { cellWidth: 30, halign: "right" },
          },
          margin: { left: 25 },
        });

        currentY = (pdf as any).lastAutoTable.finalY;
      }

      // Add invoice totals
      autoTable(pdf, {
        startY: currentY,
        body: [
          ["Subtotal:", `$${invoice.subtotal.toFixed(2)}`],
          ["Tax:", `$${invoice.tax_amount.toFixed(2)}`],
          ["Total:", `$${invoice.total_amount.toFixed(2)}`],
          ["Paid:", `$${invoice.amount_paid.toFixed(2)}`],
        ],
        theme: "plain",
        styles: {
          fontSize: 8,
          cellPadding: 2,
          textColor: [51, 51, 51],
        },
        columnStyles: {
          0: { cellWidth: 140, halign: "right", fontStyle: "bold" },
          1: { cellWidth: 30, halign: "right" },
        },
        margin: { left: 25 },
      });

      currentY = (pdf as any).lastAutoTable.finalY;

      // Add payment history if exists
      if (invoice.order?.payments && invoice.order.payments.length > 0) {
        currentY += 3;

        // Check if we need a new page
        if (currentY > 240) {
          pdf.addPage();
          currentY = 20;
        }

        const paymentsData = invoice.order.payments.map((payment) => [
          format(new Date(payment.payment_date), "MMM dd, yyyy"),
          payment.payment_method.replace('_', ' ').toUpperCase(),
          `$${payment.amount.toFixed(2)}`,
          payment.reference_number || '-',
        ]);

        autoTable(pdf, {
          startY: currentY,
          head: [["Payment Date", "Method", "Amount", "Reference"]],
          body: paymentsData,
          theme: "plain",
          styles: {
            fontSize: 7,
            cellPadding: 2,
            textColor: [51, 51, 51],
            lineColor: [230, 230, 230],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [248, 250, 252],
            textColor: [34, 197, 94],
            fontStyle: "bold",
            fontSize: 7,
            cellPadding: 2,
          },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 40 },
            2: { cellWidth: 30, halign: "right", textColor: [34, 197, 94], fontStyle: "bold" },
            3: { cellWidth: 35 },
          },
          margin: { left: 25 },
        });

        currentY = (pdf as any).lastAutoTable.finalY;
      }

      currentY += 5;
    });

    // Summary section at the bottom
    let finalY = (pdf as any).lastAutoTable.finalY + 10;
    
    // Check if we need a new page for summary
    if (finalY > 230) {
      pdf.addPage();
      finalY = 20;
    }
    
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(120, finalY, 70, 30, 2, 2, "F");

    pdf.setFontSize(9);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Amount Billed:", 125, finalY + 7);
    pdf.text(`$${totalBilled.toFixed(2)}`, 185, finalY + 7, { align: "right" });

    pdf.text("Total Amount Paid:", 125, finalY + 14);
    pdf.setTextColor(34, 197, 94);
    pdf.text(`$${totalPaid.toFixed(2)}`, 185, finalY + 14, { align: "right" });

    pdf.setDrawColor(230, 230, 230);
    pdf.line(125, finalY + 17, 185, finalY + 17);

    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(239, 68, 68);
    pdf.text("Outstanding Balance:", 125, finalY + 24);
    pdf.text(`$${outstanding.toFixed(2)}`, 185, finalY + 24, { align: "right" });

    // Footer
    const footerY = 270;
    pdf.setDrawColor(230, 230, 230);
    pdf.line(20, footerY - 5, 190, footerY - 5);
    
    pdf.setFontSize(8);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text("Thank you for your business!", 105, footerY, { align: "center" });
    pdf.text(
      "For any questions, please contact us at gafmedia02@gmail.com or call 0619130707",
      105,
      footerY + 5,
      { align: "center" }
    );

    // Save PDF
    const filename = `Customer-Report-${customer.name.replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
    pdf.save(filename);

    return true;
  } catch (error) {
    console.error("Error generating customer report PDF:", error);
    throw error;
  }
};
