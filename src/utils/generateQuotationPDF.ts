import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImg from "@/assets/gaf-media-logo-poster.png";
import qrCodeImg from "@/assets/qr-code-gaf.png";

interface QuotationData {
  quotationNumber: string;
  quotationDate: string;
  validUntil?: string;
  customerName: string;
  customerContact?: string;
  customerEmail?: string;
  customerAddress?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  subtotal: number;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  terms?: string;
  status: "draft" | "sent" | "approved" | "converted";
}

export const generateQuotationPDF = (quotationNumber: string, data: QuotationData) => {
  try {
    console.log("Starting PDF generation for quotation:", quotationNumber);
    
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210;
    const leftMargin = 15;
    const rightMargin = 195;

    // Header with Blue Bar and Logo
    pdf.setFillColor(30, 64, 175);
    pdf.rect(leftMargin, 10, 60, 12, "F");
    pdf.setFontSize(16);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text("BAIDOA", leftMargin + 30, 18, { align: "center" });

    // Logo on right
    pdf.addImage(logoImg, "PNG", 140, 5, 55, 35);

    // Quotation Title - Centered
    pdf.setFontSize(20);
    pdf.setTextColor(30, 64, 175);
    pdf.setFont("helvetica", "bold");
    pdf.text("QIIMO SIIN", pageWidth / 2, 55, { align: "center" });
    
    pdf.setFontSize(10);
    pdf.setTextColor(220, 38, 38);
    pdf.text("QUOTATION", pageWidth / 2, 61, { align: "center" });

    // Two Column Layout for Customer and Quotation Info
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

    // Right Column - Quotation Info
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

    addRightRow("Taariikhada", "Quotation Date", data.quotationDate);
    addRightRow("Wax Ku Ooli", "Valid Until", data.validUntil || "-");
    addRightRow("Tixraaca", "Quotation#", data.quotationNumber);
    addRightRow("Xarunta", "Branch", "Baidoa");
    addRightRow("Xaalada", "Status", data.status.toUpperCase());

    // Items Table
    const tableStartY = 100;
    const tableData = data.items.map(item => [
      item.description,
      item.quantity.toString(),
      `$${item.unitPrice.toFixed(2)}`,
      `$${item.amount.toFixed(2)}`
    ]);

    autoTable(pdf, {
      startY: tableStartY,
      head: [[
        { content: 'Faah faahin (Description)', styles: { halign: 'left' } },
        { content: 'Tirada (Quantity)', styles: { halign: 'center' } },
        { content: 'Qiimaha (Unit Price)', styles: { halign: 'right' } },
        { content: 'Wadarta (Amount)', styles: { halign: 'right' } }
      ]],
      body: tableData,
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: [51, 51, 51],
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 4,
      },
      bodyStyles: {
        textColor: [220, 38, 38],
      },
      columnStyles: {
        0: { cellWidth: 80, textColor: [220, 38, 38] },
        1: { cellWidth: 25, halign: 'center', textColor: [51, 51, 51] },
        2: { cellWidth: 35, halign: 'right', textColor: [51, 51, 51] },
        3: { cellWidth: 35, halign: 'right', textColor: [51, 51, 51] },
      },
    });

    // Footer Section
    const finalY = (pdf as any).lastAutoTable.finalY + 10;

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

    addTotalRow("Wadarta Guud", "Subtotal", `$${data.subtotal.toFixed(2)}`);
    
    if (data.discountAmount > 0) {
      const discountLabel = data.discountType === 'percentage' 
        ? `Qiimo dhimis (${data.discountValue}%)` 
        : 'Qiimo dhimis';
      addTotalRow(discountLabel, "Discount", `-$${data.discountAmount.toFixed(2)}`);
    }
    
    if (data.taxAmount > 0) {
      addTotalRow(`Canshuurta (${data.taxRate}%)`, "Tax", `$${data.taxAmount.toFixed(2)}`);
    }
    
    // Total Amount - Highlighted
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("Wadarta (Total):", totalsX, totalsY);
    pdf.setTextColor(30, 64, 175);
    pdf.text(`$${data.totalAmount.toFixed(2)}`, rightMargin, totalsY, { align: "right" });
    totalsY += 10;

    // Notes & Terms
    if (data.notes || data.terms) {
      pdf.setFontSize(7);
      pdf.setTextColor(128, 128, 128);
      
      if (data.notes) {
        pdf.text(`Notes: ${data.notes}`, leftMargin, totalsY);
        totalsY += 4;
      }
      
      if (data.terms) {
        const termsLines = pdf.splitTextToSize(`Terms: ${data.terms}`, 180);
        pdf.text(termsLines, leftMargin, totalsY);
      }
    }

    // Status Badge
    const statusY = totalsY + 10;
    const statusText = data.status === "approved" ? "APPROVED / LA ANSIXIYEY" : 
                       data.status === "sent" ? "SENT / LA DIRAY" : 
                       data.status === "converted" ? "CONVERTED / LA BEDDELAY" :
                       "DRAFT / QORAAL";
    const statusColor = data.status === "approved" ? [34, 197, 94] : 
                        data.status === "sent" ? [59, 130, 246] : 
                        data.status === "converted" ? [139, 92, 246] :
                        [156, 163, 175];
    
    pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    const statusWidth = 50;
    pdf.roundedRect(pageWidth / 2 - statusWidth / 2, statusY - 4, statusWidth, 8, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text(statusText, pageWidth / 2, statusY + 1, { align: "center" });

    console.log("PDF generation complete, initiating download...");
    const filename = `Quotation-${quotationNumber}.pdf`;
    pdf.save(filename);
    console.log("PDF download triggered successfully:", filename);
    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};