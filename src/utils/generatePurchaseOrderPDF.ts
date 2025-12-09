import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImg from "@/assets/gaf-media-logo-poster.png";
import companyStamp from "@/assets/company-stamp.png";

interface POItem {
  productName: string;
  productCode: string;
  purchaseUnit: string;
  quantity: number;
  unitCost: number;
  amount: number;
}

interface PurchaseOrderData {
  poNumber: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  vendorName: string;
  vendorContact?: string;
  vendorEmail?: string;
  vendorAddress?: string;
  items: POItem[];
  subtotal: number;
  vatEnabled: boolean;
  vatPercentage: number;
  vatAmount: number;
  totalAmount: number;
  notes?: string;
  status: string;
}

export const generatePurchaseOrderPDF = (poNumber: string, data: PurchaseOrderData): jsPDF => {
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

  // PO Title - Centered
  pdf.setFontSize(20);
  pdf.setTextColor(30, 64, 175);
  pdf.setFont("helvetica", "bold");
  pdf.text("DALABKA IIBSIGA", pageWidth / 2, 55, { align: "center" });
  
  pdf.setFontSize(10);
  pdf.setTextColor(220, 38, 38);
  pdf.text("PURCHASE ORDER", pageWidth / 2, 61, { align: "center" });

  // Two Column Layout for Vendor and PO Info
  const infoStartY = 70;
  const labelColor = [30, 64, 175];
  const grayColor = [128, 128, 128];
  const blackColor = [51, 51, 51];

  pdf.setFontSize(8);

  // Left Column - Vendor Info
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

  addLeftRow("Iibiyaha", "Vendor", data.vendorName);
  addLeftRow("Wakiilka", "Contact", data.vendorContact || "-");
  addLeftRow("Emailka", "Email", data.vendorEmail || "-");
  addLeftRow("Cinwaanka", "Address", data.vendorAddress || "Baidoa, Somalia");

  // Right Column - PO Info
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

  addRightRow("Taariikhada", "Order Date", data.orderDate);
  addRightRow("La Filo", "Expected Delivery", data.expectedDeliveryDate || "-");
  addRightRow("Tixraaca", "PO#", data.poNumber);
  addRightRow("Xaalada", "Status", data.status.toUpperCase());

  // Items Table
  const tableStartY = 95;
  const tableData = data.items.map(item => [
    `${item.productName}\n(${item.productCode})`,
    item.purchaseUnit,
    item.quantity.toString(),
    `$${item.unitCost.toFixed(2)}`,
    `$${item.amount.toFixed(2)}`
  ]);

  autoTable(pdf, {
    startY: tableStartY,
    head: [[
      { content: 'Alaabta (Product)', styles: { halign: 'left' } },
      { content: 'Qiyaas (Unit)', styles: { halign: 'center' } },
      { content: 'Tirada (Qty)', styles: { halign: 'center' } },
      { content: 'Qiimaha (Unit Cost)', styles: { halign: 'right' } },
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
    columnStyles: {
      0: { cellWidth: 60, textColor: [220, 38, 38] },
      1: { cellWidth: 25, halign: 'center', textColor: [51, 51, 51] },
      2: { cellWidth: 20, halign: 'center', textColor: [51, 51, 51] },
      3: { cellWidth: 35, halign: 'right', textColor: [51, 51, 51] },
      4: { cellWidth: 35, halign: 'right', textColor: [51, 51, 51] },
    },
  });

  // Footer Section
  const finalY = (pdf as any).lastAutoTable.finalY + 10;

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
  
  if (data.vatEnabled && data.vatAmount > 0) {
    addTotalRow(`Canshuurta (${data.vatPercentage}%)`, "VAT", `$${data.vatAmount.toFixed(2)}`);
  }
  
  // Total Amount - Highlighted
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text("Wadarta (Total):", totalsX, totalsY);
  pdf.setTextColor(30, 64, 175);
  pdf.text(`$${data.totalAmount.toFixed(2)}`, rightMargin, totalsY, { align: "right" });
  totalsY += 10;

  // Notes
  if (data.notes) {
    pdf.setFontSize(7);
    pdf.setTextColor(128, 128, 128);
    const notesLines = pdf.splitTextToSize(`Notes: ${data.notes}`, 180);
    pdf.text(notesLines, leftMargin, totalsY);
    totalsY += notesLines.length * 4;
  }

  // Status Badge
  const statusY = totalsY + 10;
  const statusText = data.status === "approved" ? "APPROVED / LA ANSIXIYEY" : 
                     data.status === "sent" ? "SENT / LA DIRAY" : 
                     data.status === "received" ? "RECEIVED / LA HELAY" :
                     data.status === "cancelled" ? "CANCELLED / LA JOOJIYEY" :
                     "DRAFT / QORAAL";
  const statusColor = data.status === "approved" ? [34, 197, 94] : 
                      data.status === "sent" ? [59, 130, 246] : 
                      data.status === "received" ? [34, 197, 94] :
                      data.status === "cancelled" ? [239, 68, 68] :
                      [156, 163, 175];
  
  pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  const statusWidth = 50;
  pdf.roundedRect(pageWidth / 2 - statusWidth / 2, statusY - 4, statusWidth, 8, 2, 2, "F");
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.text(statusText, pageWidth / 2, statusY + 1, { align: "center" });

  // Company Stamp - Bottom right
  const stampY = statusY + 15;
  pdf.addImage(companyStamp, "PNG", rightMargin - 50, stampY, 50, 40);

  return pdf;
};

export const downloadPurchaseOrderPDF = (poNumber: string, data: PurchaseOrderData) => {
  const pdf = generatePurchaseOrderPDF(poNumber, data);
  pdf.save(`PO-${poNumber}.pdf`);
};

export const getPurchaseOrderPDFBlob = (poNumber: string, data: PurchaseOrderData): Blob => {
  const pdf = generatePurchaseOrderPDF(poNumber, data);
  return pdf.output('blob');
};
