import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerContact?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  status: "PAID" | "UNPAID" | "PARTIAL";
}

export const generateInvoicePDF = (invoiceNumber: string, data: InvoiceData) => {
  try {
    console.log("Starting PDF generation for invoice:", invoiceNumber);
    console.log("Invoice data:", data);
    
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

  // Logo placeholder (will be added later with actual logo)
  pdf.setFillColor(41, 98, 255);
  pdf.roundedRect(20, 15, 40, 15, 2, 2, "F");
  pdf.setFontSize(12);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont(undefined, "bold");
  pdf.text("GAF MEDIA", 40, 24, { align: "center" });

  // Company Header - Right aligned
  pdf.setFontSize(11);
  pdf.setTextColor(51, 51, 51);
  pdf.setFont(undefined, "bold");
  pdf.text("GAF MEDIA", 210 - 20, 20, { align: "right" });
  
  pdf.setFontSize(9);
  pdf.setTextColor(102, 102, 102);
  pdf.setFont(undefined, "normal");
  pdf.text("Shanemo Shatrale Baidoa Somalia", 210 - 20, 26, { align: "right" });
  pdf.text("Phone: 0619130707", 210 - 20, 31, { align: "right" });
  pdf.text("Email: gafmedia02@gmail.com", 210 - 20, 36, { align: "right" });

  // Subtle line separator
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.5);
  pdf.line(20, 45, 190, 45);

  // Invoice Title
  pdf.setFontSize(28);
  pdf.setTextColor(41, 98, 255);
  pdf.setFont(undefined, "bold");
  pdf.text("INVOICE", 20, 58);

  // Status badge
  const statusColor = 
    data.status === "PAID" ? [34, 197, 94] : 
    data.status === "PARTIAL" ? [234, 179, 8] : 
    [239, 68, 68];
  pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.roundedRect(150, 50, 40, 10, 2, 2, "F");
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont(undefined, "bold");
  pdf.text(data.status, 170, 56.5, { align: "center" });

  // Invoice Information Box
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(20, 68, 85, 28, 2, 2, "F");
  
  pdf.setFontSize(9);
  pdf.setTextColor(102, 102, 102);
  pdf.setFont(undefined, "bold");
  pdf.text("Invoice Number:", 25, 75);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(51, 51, 51);
  pdf.text(data.invoiceNumber, 25, 81);

  pdf.setFont(undefined, "bold");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Invoice Date:", 25, 88);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(51, 51, 51);
  pdf.text(data.invoiceDate, 25, 94);

  // Bill To Box
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(110, 68, 80, 28, 2, 2, "F");
  
  pdf.setFontSize(9);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Bill To:", 115, 75);
  
  pdf.setFontSize(10);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(51, 51, 51);
  pdf.text(data.customerName, 115, 82);
  
  if (data.customerContact) {
    pdf.setFontSize(9);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text(data.customerContact, 115, 88);
  }

  // Items Table with modern styling
  const tableData = data.items.map(item => [
    item.description,
    item.quantity.toString(),
    `$${item.unitPrice.toFixed(2)}`,
    `$${item.amount.toFixed(2)}`
  ]);

  autoTable(pdf, {
    startY: 105,
    head: [['Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 4,
      textColor: [51, 51, 51],
      lineColor: [230, 230, 230],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [51, 51, 51],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 5,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 253],
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
  });

  // Totals Section
  const finalY = (pdf as any).lastAutoTable.finalY + 10;
  const subtotal = data.items.reduce((sum, item) => sum + item.amount, 0);
  
  // Totals box
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(130, finalY, 60, 25, 2, 2, "F");
  
  pdf.setFontSize(10);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Subtotal:", 135, finalY + 7);
  pdf.text(`$${subtotal.toFixed(2)}`, 185, finalY + 7, { align: 'right' });
  
  pdf.text("Tax (0%):", 135, finalY + 14);
  pdf.text("$0.00", 185, finalY + 14, { align: 'right' });
  
  // Grand Total
  pdf.setDrawColor(230, 230, 230);
  pdf.line(135, finalY + 17, 185, finalY + 17);
  
  pdf.setFontSize(12);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(41, 98, 255);
  pdf.text("Total:", 135, finalY + 23);
  pdf.text(`$${subtotal.toFixed(2)}`, 185, finalY + 23, { align: 'right' });

  // Payment Information Section (placeholder)
  const paymentY = finalY + 35;
  pdf.setFontSize(11);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(51, 51, 51);
  pdf.text("Payment Information", 20, paymentY);
  
  pdf.setFontSize(9);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Bank Account Details:", 20, paymentY + 7);
  pdf.text("(Payment details will be added here)", 20, paymentY + 13);

  // Footer
  const footerY = 270;
  pdf.setDrawColor(230, 230, 230);
  pdf.line(20, footerY - 5, 190, footerY - 5);
  
  pdf.setFontSize(8);
  pdf.setTextColor(102, 102, 102);
  pdf.text("Thank you for your business!", 105, footerY, { align: "center" });
  pdf.text("For any questions, please contact us at gafmedia02@gmail.com or call 0619130707", 105, footerY + 5, { align: "center" });

    console.log("PDF generation complete, initiating download...");
    const filename = `Invoice-${invoiceNumber}.pdf`;
    pdf.save(filename);
    console.log("PDF download triggered successfully:", filename);
    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};
