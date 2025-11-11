import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import logoImg from "@/assets/gaf-media-logo-full.png";

interface Payment {
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number?: string;
  notes?: string;
  order: {
    job_title: string;
    customer: {
      name: string;
    };
  } | null;
}

interface FilterOptions {
  dateFrom?: Date;
  dateTo?: Date;
  paymentMethod?: string;
}

export const generatePaymentsReportPDF = (
  payments: Payment[],
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

    // Company Details
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
    pdf.text("PAYMENTS REPORT", 20, 54);

    // Report Date
    pdf.setFontSize(9);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text(`Generated: ${format(new Date(), "MMMM dd, yyyy")}`, 210 - 20, 54, { align: "right" });

    // Calculate totals
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalTransactions = payments.length;

    // Summary Section
    let yPos = 65;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, yPos, 170, 25, 2, 2, "F");

    pdf.setFontSize(12);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text("Summary", 25, yPos + 7);

    pdf.setFontSize(10);
    pdf.setTextColor(51, 51, 51);
    pdf.text(`Total Transactions: ${totalTransactions}`, 25, yPos + 15);
    pdf.text(`Total Amount: $${totalAmount.toFixed(2)}`, 120, yPos + 15);

    // Filter Information
    yPos = 97;
    if (filters.dateFrom || filters.dateTo || (filters.paymentMethod && filters.paymentMethod !== 'all')) {
      pdf.setFontSize(9);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(102, 102, 102);
      pdf.text("Applied Filters:", 20, yPos);
      
      pdf.setFont(undefined, "normal");
      let filterText = [];
      if (filters.dateFrom) filterText.push(`From: ${format(filters.dateFrom, "MMM dd, yyyy")}`);
      if (filters.dateTo) filterText.push(`To: ${format(filters.dateTo, "MMM dd, yyyy")}`);
      if (filters.paymentMethod && filters.paymentMethod !== 'all') {
        filterText.push(`Method: ${filters.paymentMethod.replace('_', ' ')}`);
      }
      
      pdf.text(filterText.join(" | "), 50, yPos);
      yPos += 8;
    }

    // Payments Table
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text("Payment Details", 20, yPos);

    yPos += 5;

    const paymentsData = payments.map((payment) => [
      format(new Date(payment.payment_date), "MMM dd, yyyy"),
      payment.order?.customer?.name || "N/A",
      payment.order?.job_title || "N/A",
      payment.payment_method.replace('_', ' ').toUpperCase(),
      `$${payment.amount.toFixed(2)}`,
      payment.reference_number || '-',
    ]);

    autoTable(pdf, {
      startY: yPos,
      head: [["Date", "Customer", "Order", "Method", "Amount", "Reference"]],
      body: paymentsData,
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
      alternateRowStyles: {
        fillColor: [252, 252, 253],
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 35 },
        2: { cellWidth: 40 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25, halign: "right", textColor: [34, 197, 94], fontStyle: "bold" },
        5: { cellWidth: 25 },
      },
      margin: { left: 20, right: 20 },
    });

    // Summary at the bottom
    let finalY = (pdf as any).lastAutoTable.finalY + 10;
    
    // Check if we need a new page for summary
    if (finalY > 240) {
      pdf.addPage();
      finalY = 20;
    }
    
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(120, finalY, 70, 20, 2, 2, "F");

    pdf.setFontSize(9);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Total Transactions:", 125, finalY + 7);
    pdf.text(totalTransactions.toString(), 185, finalY + 7, { align: "right" });

    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(34, 197, 94);
    pdf.text("Total Amount:", 125, finalY + 15);
    pdf.text(`$${totalAmount.toFixed(2)}`, 185, finalY + 15, { align: "right" });

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
    const filename = `Payments-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
    pdf.save(filename);

    return true;
  } catch (error) {
    console.error("Error generating payments report PDF:", error);
    throw error;
  }
};
