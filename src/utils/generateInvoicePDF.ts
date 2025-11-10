import jsPDF from "jspdf";
import "jspdf-autotable";

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

export const generateInvoicePDF = async (invoiceNumber: string, data: InvoiceData) => {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Add logo (if available as base64 or URL)
  // Note: You'll need to convert the logo to base64 or use a public URL
  
  // Company Header
  pdf.setFontSize(10);
  pdf.setTextColor(100);
  pdf.text("Shanemo Shatrale Baidoa Somalia", 20, 30);
  pdf.text("Phone: 0619130707", 20, 36);
  pdf.text("Email: gafmedia02@gmail.com", 20, 42);

  // Invoice Title
  pdf.setFontSize(32);
  pdf.setTextColor(41, 98, 255); // Primary color
  pdf.setFont(undefined, "bold");
  pdf.text("INVOICE", 20, 60);

  // Invoice Details
  pdf.setFontSize(10);
  pdf.setTextColor(0);
  pdf.setFont(undefined, "bold");
  pdf.text("Invoice Number:", 20, 75);
  pdf.setFont(undefined, "normal");
  pdf.text(data.invoiceNumber, 20, 81);

  pdf.setFont(undefined, "bold");
  pdf.text("Invoice Date:", 20, 90);
  pdf.setFont(undefined, "normal");
  pdf.text(data.invoiceDate, 20, 96);

  // Bill To
  pdf.setFont(undefined, "bold");
  pdf.text("Bill To:", 120, 75);
  pdf.setFont(undefined, "normal");
  pdf.text(data.customerName, 120, 81);
  if (data.customerContact) {
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text(data.customerContact, 120, 87);
  }

  // Items Table
  const tableData = data.items.map(item => [
    item.description,
    item.quantity.toString(),
    `$${item.unitPrice.toFixed(2)}`,
    `$${item.amount.toFixed(2)}`
  ]);

  (pdf as any).autoTable({
    startY: 110,
    head: [['Description', 'Qty', 'Unit Price', 'Amount']],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
  });

  // Total
  const finalY = (pdf as any).lastAutoTable.finalY + 10;
  const total = data.items.reduce((sum, item) => sum + item.amount, 0);
  
  pdf.setFontSize(12);
  pdf.setFont(undefined, "bold");
  pdf.text("Total:", 150, finalY);
  pdf.setFontSize(16);
  pdf.text(`$${total.toFixed(2)}`, 175, finalY, { align: 'right' });

  // Status
  pdf.setFontSize(14);
  pdf.setFont(undefined, "bold");
  const statusColor = 
    data.status === "PAID" ? [34, 197, 94] : 
    data.status === "PARTIAL" ? [234, 179, 8] : 
    [239, 68, 68];
  pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.text(`Status: ${data.status}`, 105, finalY + 20, { align: 'center' });

  pdf.save(`Invoice-${invoiceNumber}.pdf`);
};
