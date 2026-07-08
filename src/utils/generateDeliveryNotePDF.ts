import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImg from "@/assets/gaf-media-logo-poster.png";
import companyStamp from "@/assets/company-stamp.png";

interface DeliveryNoteData {
  deliveryNumber: string;
  deliveryDate: string;
  invoiceNumber?: string;
  customerName: string;
  customerContact?: string;
  customerEmail?: string;
  customerAddress?: string;
  items: Array<{ description: string; quantity: number }>;
  notes?: string;
  receivedBy?: string;
}

export const generateDeliveryNotePDF = (deliveryNumber: string, data: DeliveryNoteData) => {
  try {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const leftMargin = 15;
    const rightMargin = 195;

    // Header
    pdf.setFillColor(30, 64, 175);
    pdf.rect(leftMargin, 10, 60, 12, "F");
    pdf.setFontSize(16);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text("BAIDOA", leftMargin + 30, 18, { align: "center" });

    pdf.addImage(logoImg, "PNG", 140, 5, 55, 35);

    // Title
    pdf.setFontSize(20);
    pdf.setTextColor(30, 64, 175);
    pdf.setFont("helvetica", "bold");
    pdf.text("WARQADDA GAARSIINTA", pageWidth / 2, 55, { align: "center" });

    pdf.setFontSize(10);
    pdf.setTextColor(220, 38, 38);
    pdf.text("DELIVERY NOTE", pageWidth / 2, 61, { align: "center" });

    const infoStartY = 70;
    const labelColor = [30, 64, 175];
    const grayColor = [128, 128, 128];
    const blackColor = [51, 51, 51];

    pdf.setFontSize(8);

    // Left column - customer
    const leftCol = leftMargin;
    let leftY = infoStartY;
    const addLeftRow = (somali: string, english: string, value: string) => {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
      pdf.text(somali, leftCol, leftY);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      pdf.text(`(${english}):`, leftCol + 25, leftY);
      pdf.setTextColor(blackColor[0], blackColor[1], blackColor[2]);
      pdf.text(value, leftCol + 50, leftY);
      leftY += 5;
    };
    addLeftRow("Macmiilka", "Customer", data.customerName);
    addLeftRow("Wakiilka", "Contact Person", data.customerName);
    addLeftRow("Lambarka", "Telephone", data.customerContact || "-");
    addLeftRow("Emailka", "Email", data.customerEmail || "-");
    addLeftRow("Cinwaanka", "Address", data.customerAddress || "Baidoa, Somalia");

    // Right column - delivery
    const rightCol = 110;
    let rightY = infoStartY;
    const addRightRow = (somali: string, english: string, value: string) => {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
      pdf.text(somali, rightCol, rightY);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
      pdf.text(`(${english}):`, rightCol + 30, rightY);
      pdf.setTextColor(blackColor[0], blackColor[1], blackColor[2]);
      pdf.text(value, rightCol + 55, rightY);
      rightY += 5;
    };
    addRightRow("Taariikhda", "Delivery Date", data.deliveryDate);
    addRightRow("Tixraaca", "Delivery#", data.deliveryNumber);
    addRightRow("Faktiga", "Invoice#", data.invoiceNumber || "-");
    addRightRow("Xarunta", "Branch", "Baidoa");

    // Items table - qty only, no prices
    const tableStartY = 100;
    const tableData = data.items.map((item, i) => [
      (i + 1).toString(),
      item.description,
      item.quantity.toString(),
    ]);

    autoTable(pdf, {
      startY: tableStartY,
      head: [[
        { content: "#", styles: { halign: "center" } },
        { content: "Faah faahin (Description)", styles: { halign: "left" } },
        { content: "Tirada (Quantity)", styles: { halign: "center" } },
      ]],
      body: tableData,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 3, textColor: [51, 51, 51], lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" },
        1: { cellWidth: 130, textColor: [220, 38, 38] },
        2: { cellWidth: 35, halign: "center" },
      },
    });

    const finalY = (pdf as any).lastAutoTable.finalY + 15;

    // Notes
    if (data.notes) {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(30, 64, 175);
      pdf.text("Notes:", leftMargin, finalY);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(51, 51, 51);
      const lines = pdf.splitTextToSize(data.notes, 180);
      pdf.text(lines, leftMargin, finalY + 5);
    }

    // Signature lines
    const sigY = finalY + 30;
    pdf.setDrawColor(51, 51, 51);
    pdf.setFontSize(8);
    pdf.setTextColor(51, 51, 51);

    // Delivered by
    pdf.line(leftMargin, sigY, leftMargin + 60, sigY);
    pdf.setFont("helvetica", "bold");
    pdf.text("La Gaarsiiyay (Delivered By)", leftMargin, sigY + 5);
    pdf.setFont("helvetica", "normal");
    pdf.text("Signature & Date", leftMargin, sigY + 10);

    // Received by
    pdf.line(110, sigY, 170, sigY);
    pdf.setFont("helvetica", "bold");
    pdf.text("La Helay (Received By)", 110, sigY + 5);
    pdf.setFont("helvetica", "normal");
    pdf.text(data.receivedBy || "Signature & Date", 110, sigY + 10);

    // Stamp
    pdf.addImage(companyStamp, "PNG", rightMargin - 50, sigY + 15, 50, 40);

    pdf.save(`DeliveryNote-${deliveryNumber}.pdf`);
    return true;
  } catch (error) {
    console.error("Error generating delivery note PDF:", error);
    throw error;
  }
};