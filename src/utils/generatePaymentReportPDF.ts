import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import logoImg from "@/assets/gaf-media-logo-full.png";

export interface PdfAllocation {
  invoice_number: string;
  original_amount: number;
  previous_balance: number;
  allocated: number;
  remaining: number;
  status: string;
}

export interface PdfTransaction {
  payment_id: string;
  date: string;
  customer: string;
  method: string;
  received: number;
  allocated: number;
  unallocated: number;
  allocations: PdfAllocation[];
}

export interface PdfSummary {
  periodLabel: string;
  totalReceived: number;
  paymentCount: number;
  totalAllocated: number;
  totalUnallocated: number;
  invoicesAffected: number;
  paidAllocations: number;
  partialAllocations: number;
  methodBreakdown: { method: string; amount: number }[];
}

const money = (n: number) =>
  `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generatePaymentReportPDF = (summary: PdfSummary, transactions: PdfTransaction[]) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  try {
    pdf.addImage(logoImg, "PNG", 20, 12, 45, 18);
  } catch {
    /* logo optional */
  }

  pdf.setFontSize(9);
  pdf.setTextColor(51, 51, 51);
  pdf.setFont(undefined, "bold");
  pdf.text("GAF MEDIA", 190, 18, { align: "right" });
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Shanemo Shatrale Baidoa Somalia", 190, 23, { align: "right" });
  pdf.text("Phone: 0619130707", 190, 28, { align: "right" });

  pdf.setDrawColor(230, 230, 230);
  pdf.line(20, 34, 190, 34);

  pdf.setFontSize(20);
  pdf.setTextColor(218, 34, 39);
  pdf.setFont(undefined, "bold");
  pdf.text("PAYMENT ALLOCATION REPORT", 20, 45);

  pdf.setFontSize(9);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text(summary.periodLabel, 20, 51);
  pdf.text(`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, 190, 51, { align: "right" });

  // Summary block
  let y = 58;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(20, y, 170, 34, 2, 2, "F");
  pdf.setFontSize(10);
  pdf.setTextColor(57, 61, 140);
  pdf.setFont(undefined, "bold");
  pdf.text("Summary", 25, y + 7);

  pdf.setFontSize(9);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(51, 51, 51);
  pdf.text(`Total Money Received: ${money(summary.totalReceived)}`, 25, y + 15);
  pdf.text(`Number of Payments: ${summary.paymentCount}`, 25, y + 21);
  pdf.text(`Invoices Affected: ${summary.invoicesAffected}`, 25, y + 27);
  pdf.text(`Total Allocated: ${money(summary.totalAllocated)}`, 110, y + 15);
  pdf.text(`Unallocated: ${money(summary.totalUnallocated)}`, 110, y + 21);
  pdf.text(
    `Paid Alloc: ${money(summary.paidAllocations)}  |  Partial Alloc: ${money(summary.partialAllocations)}`,
    110,
    y + 27,
  );

  y += 42;

  if (summary.methodBreakdown.length) {
    autoTable(pdf, {
      startY: y,
      head: [["Payment Method", "Amount"]],
      body: summary.methodBreakdown.map((m) => [m.method, money(m.amount)]),
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.1 },
      headStyles: { fillColor: [57, 61, 140], textColor: [255, 255, 255], fontSize: 8 },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: 20, right: 110 },
    });
    y = (pdf as any).lastAutoTable.finalY + 8;
  }

  autoTable(pdf, {
    startY: y,
    head: [["Date", "Payment ID", "Customer", "Method", "Received", "Allocated", "Unallocated"]],
    body: transactions.map((t) => [
      t.date,
      t.payment_id,
      t.customer,
      t.method,
      money(t.received),
      money(t.allocated),
      money(t.unallocated),
    ]),
    theme: "plain",
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.1 },
    headStyles: { fillColor: [218, 34, 39], textColor: [255, 255, 255], fontSize: 8 },
    alternateRowStyles: { fillColor: [252, 252, 253] },
    columnStyles: {
      4: { halign: "right", fontStyle: "bold" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    margin: { left: 20, right: 20 },
  });

  // Allocation detail pages
  const withAlloc = transactions.filter((t) => t.allocations.length);
  if (withAlloc.length) {
    pdf.addPage();
    let dy = 20;
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(57, 61, 140);
    pdf.text("Invoice Allocation Details", 20, dy);
    dy += 6;

    withAlloc.forEach((t) => {
      if (dy > 250) {
        pdf.addPage();
        dy = 20;
      }
      pdf.setFontSize(9);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(51, 51, 51);
      pdf.text(
        `${t.payment_id} • ${t.customer} • ${t.date} • ${t.method} • Received ${money(t.received)}`,
        20,
        dy + 6,
      );
      autoTable(pdf, {
        startY: dy + 9,
        head: [["Invoice", "Original", "Prev. Balance", "Allocated", "Remaining", "Status"]],
        body: t.allocations.map((a) => [
          a.invoice_number,
          money(a.original_amount),
          money(a.previous_balance),
          money(a.allocated),
          money(a.remaining),
          a.status,
        ]),
        theme: "plain",
        styles: { fontSize: 7.5, cellPadding: 1.8, lineColor: [235, 235, 235], lineWidth: 0.1 },
        headStyles: { fillColor: [240, 240, 245], textColor: [51, 51, 51], fontSize: 7.5 },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right", fontStyle: "bold" },
          4: { halign: "right" },
        },
        margin: { left: 20, right: 20 },
      });
      dy = (pdf as any).lastAutoTable.finalY + 6;
    });
  }

  pdf.save(`Payment-Allocation-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
};
