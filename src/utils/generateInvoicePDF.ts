import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImg from "@/assets/gaf-media-logo-poster.png";
import qrCodeImg from "@/assets/qr-code-gaf.png";

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerContact?: string;
  customerEmail?: string;
  customerAddress?: string;
  salesperson?: string;
  paymentMethod?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    // Area-based fields
    saleType?: string;
    widthM?: number;
    heightM?: number;
    areaM2?: number;
    ratePerM2?: number;
  }>;
  status: "PAID" | "UNPAID" | "PARTIAL";
  amountPaid?: number;
  totalAmount?: number;
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

    const pageWidth = 210;
    const leftMargin = 15;
    const rightMargin = 195;

    // Header with Blue Bar and Logo
    pdf.setFillColor(30, 64, 175); // Blue color
    pdf.rect(leftMargin, 10, 60, 12, "F");
    pdf.setFontSize(16);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text("BAIDOA", leftMargin + 30, 18, { align: "center" });

    // Logo on right
    pdf.addImage(logoImg, "PNG", 140, 5, 55, 35);

    // Invoice Title - Centered
    pdf.setFontSize(20);
    pdf.setTextColor(30, 64, 175);
    pdf.setFont("helvetica", "bold");
    pdf.text("QAANSHEEG", pageWidth / 2, 55, { align: "center" });
    
    pdf.setFontSize(10);
    pdf.setTextColor(220, 38, 38);
    pdf.text("INVOICE", pageWidth / 2, 61, { align: "center" });

    // Two Column Layout for Customer and Invoice Info
    const infoStartY = 70;
    const labelColor = [30, 64, 175];
    const grayColor = [128, 128, 128];
    const blackColor = [51, 51, 51];

    pdf.setFontSize(8);

    // Left Column - Customer Info
    const leftCol = leftMargin;
    let leftY = infoStartY;

    const addLeftRow = (somaliLabel: string, englishLabel: string, value: string) => {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
      pdf.text(somaliLabel, leftCol, leftY);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      pdf.text(`(${englishLabel}):`, leftCol + 25, leftY);
      pdf.setTextColor(blackColor[0], blackColor[1], blackColor[2]);
      pdf.text(value, leftCol + 50, leftY);
      leftY += 5;
    };

    addLeftRow("Macmiilka", "Customer", data.customerName);
    addLeftRow("Wakiilka", "Contact Person", data.customerName);
    addLeftRow("Lambarka", "Telephone", data.customerContact || "-");
    addLeftRow("Emailka", "Email", data.customerEmail || "-");
    addLeftRow("Cinwaanka", "Address", data.customerAddress || "Baidoa, Somalia");

    // Right Column - Invoice Info
    const rightCol = 110;
    let rightY = infoStartY;

    const addRightRow = (somaliLabel: string, englishLabel: string, value: string) => {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
      pdf.text(somaliLabel, rightCol, rightY);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      pdf.text(`(${englishLabel}):`, rightCol + 30, rightY);
      pdf.setTextColor(blackColor[0], blackColor[1], blackColor[2]);
      pdf.text(value, rightCol + 55, rightY);
      rightY += 5;
    };

    addRightRow("Taariikhada", "Invoice Date", data.invoiceDate);
    addRightRow("Iibiyaha", "Salesperson", data.salesperson || "-");
    addRightRow("Tixraaca", "Invoice#", data.invoiceNumber);
    addRightRow("Xarunta", "Branch", "Baidoa");
    addRightRow("Nooca Bixinta", "Payment Method", data.paymentMethod || "Cash");

    // Items Table with dimension support
    const tableStartY = 100;
    const tableData = data.items.map(item => {
      const isAreaBased = item.saleType === 'area' || (item.areaM2 && item.areaM2 > 0);
      
      // Format quantity/size column
      const qtySize = isAreaBased 
        ? `${(item.widthM || 0).toFixed(2)} × ${(item.heightM || 0).toFixed(2)} m\n${(item.areaM2 || 0).toFixed(2)} m²`
        : item.quantity.toString();
      
      // Format rate column
      const rate = isAreaBased
        ? `$${item.unitPrice.toFixed(2)}/m²`
        : `$${item.unitPrice.toFixed(2)}`;
      
      return [
        item.description,
        qtySize,
        rate,
        `$${item.amount.toFixed(2)}`
      ];
    });

    autoTable(pdf, {
      startY: tableStartY,
      head: [[
        { content: 'Faah faahin (Description)', styles: { halign: 'left' } },
        { content: 'Tirada/Cabir (Qty/Size)', styles: { halign: 'center' } },
        { content: 'Qiimaha (Rate)', styles: { halign: 'right' } },
        { content: 'Wadarta (Amount)', styles: { halign: 'right' } }
      ]],
      body: tableData,
      theme: 'plain',
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: [51, 51, 51],
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: 4,
      },
      bodyStyles: {
        textColor: [220, 38, 38],
      },
      columnStyles: {
        0: { cellWidth: 70, textColor: [220, 38, 38] },
        1: { cellWidth: 35, halign: 'center', textColor: [51, 51, 51] },
        2: { cellWidth: 35, halign: 'right', textColor: [51, 51, 51] },
        3: { cellWidth: 35, halign: 'right', textColor: [51, 51, 51] },
      },
    });

    // Footer Section
    const finalY = (pdf as any).lastAutoTable.finalY + 10;
    const subtotal = data.items.reduce((sum, item) => sum + item.amount, 0);
    const total = data.totalAmount ?? subtotal;
    const amountPaid = data.amountPaid ?? 0;
    const amountDue = total - amountPaid;

    // QR Code Section
    pdf.addImage(qrCodeImg, "PNG", leftMargin, finalY, 25, 25);
    
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 64, 175);
    pdf.text("FADLAN HALKAAN ISKAANGAREE", leftMargin + 30, finalY + 8);
    pdf.text("SI AAD U HUBISO", leftMargin + 30, finalY + 13);
    pdf.setFont("helvetica", "italic");
    pdf.setTextColor(128, 128, 128);
    pdf.text("Please Scan Here To Verify", leftMargin + 30, finalY + 20);

    // Totals Section - Right side
    const totalsX = 130;
    let totalsY = finalY;

    const addTotalRow = (somaliLabel: string, englishLabel: string, value: string, isBold = false) => {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", isBold ? "bold" : "normal");
      pdf.setTextColor(51, 51, 51);
      pdf.text(`${somaliLabel} (${englishLabel}):`, totalsX, totalsY);
      pdf.text(value, rightMargin, totalsY, { align: "right" });
      pdf.setDrawColor(200, 200, 200);
      pdf.line(totalsX, totalsY + 2, rightMargin, totalsY + 2);
      totalsY += 7;
    };

    addTotalRow("Wadarta Guud", "Total Amount", `$${total.toFixed(2)}`);
    addTotalRow("Canshuurta Kahor", "Untaxed Amount", `$${subtotal.toFixed(2)}`);
    addTotalRow("Canshuurta", "VAT", "$0.00");
    addTotalRow("Lacagta La Bixiyey", "Amount Paid", `$${amountPaid.toFixed(2)}`);
    
    // Amount Due - Highlighted
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("Haraa (Amount Due):", totalsX, totalsY);
    if (amountDue > 0) {
      pdf.setTextColor(220, 38, 38);
    } else {
      pdf.setTextColor(34, 197, 94);
    }
    pdf.text(`$${amountDue.toFixed(2)}`, rightMargin, totalsY, { align: "right" });

    // Status Badge at bottom
    const statusY = totalsY + 15;
    const statusText = data.status === "PAID" ? "PAID / LA BIXIYEY" : 
                       data.status === "PARTIAL" ? "PARTIAL / QAYB" : 
                       "UNPAID / LAMA BIXIN";
    const statusColor = data.status === "PAID" ? [34, 197, 94] : 
                        data.status === "PARTIAL" ? [234, 179, 8] : 
                        [220, 38, 38];
    
    pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    const statusWidth = 45;
    pdf.roundedRect(pageWidth / 2 - statusWidth / 2, statusY - 4, statusWidth, 8, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text(statusText, pageWidth / 2, statusY + 1, { align: "center" });

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
