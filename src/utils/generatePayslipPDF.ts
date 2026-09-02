import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import logoImg from "@/assets/gaf-media-logo-full.png";

export interface PayslipData {
  employeeName: string;
  employeeEmail?: string | null;
  periodLabel: string;
  grossAmount: number;
  allowances: number;
  deductions: number;
  netAmount: number;
  paymentMethod: string;
  reference?: string | null;
  paidAt: string;
  processedBy?: string | null;
  notes?: string | null;
}

const money = (n: number) =>
  `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generatePayslipPDF = (p: PayslipData) => {
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
  pdf.text("PAY SLIP", 20, 45);

  pdf.setFontSize(9);
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text(`Pay Period: ${p.periodLabel}`, 20, 51);
  pdf.text(`Payment Date: ${format(new Date(p.paidAt), "MMM dd, yyyy")}`, 190, 51, { align: "right" });

  let y = 58;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(20, y, 170, 24, 2, 2, "F");
  pdf.setFontSize(10);
  pdf.setTextColor(57, 61, 140);
  pdf.setFont(undefined, "bold");
  pdf.text("Employee", 25, y + 7);
  pdf.setFont(undefined, "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(51, 51, 51);
  pdf.text(p.employeeName, 25, y + 14);
  if (p.employeeEmail) pdf.text(p.employeeEmail, 25, y + 20);
  pdf.text(`Payment Method: ${p.paymentMethod.replace(/_/g, " ").toUpperCase()}`, 120, y + 14);
  if (p.reference) pdf.text(`Ref: ${p.reference}`, 120, y + 20);

  y += 32;

  autoTable(pdf, {
    startY: y,
    head: [["Description", "Amount"]],
    body: [
      ["Gross Salary", money(p.grossAmount)],
      ["Allowances / Bonuses", money(p.allowances)],
      ["Deductions / Salary Advances", `- ${money(p.deductions)}`],
      ["Net Payable", money(p.netAmount)],
    ],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.1 },
    headStyles: { fillColor: [57, 61, 140], textColor: [255, 255, 255], fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 3) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [34, 197, 94];
      }
    },
    margin: { left: 20, right: 20 },
  });

  y = (pdf as any).lastAutoTable.finalY + 8;

  autoTable(pdf, {
    startY: y,
    head: [["Journal Entry", "Debit", "Credit"]],
    body: [
      ["Salaries & Wages Expense", money(p.grossAmount + p.allowances), ""],
      ["Cash / Bank Disbursement", "", money(p.netAmount)],
      ["Employee Loan / Advance Receivable", "", money(p.deductions)],
    ],
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [235, 235, 235], lineWidth: 0.1 },
    headStyles: { fillColor: [240, 240, 245], textColor: [51, 51, 51], fontSize: 8 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 20, right: 20 },
  });

  y = (pdf as any).lastAutoTable.finalY + 10;

  if (p.notes) {
    pdf.setFontSize(8);
    pdf.setTextColor(102, 102, 102);
    pdf.text(`Notes: ${p.notes}`, 20, y);
    y += 8;
  }

  pdf.setFontSize(8);
  pdf.setTextColor(102, 102, 102);
  pdf.text(`Processed by: ${p.processedBy || "—"}`, 20, y);
  pdf.text("This is a system generated pay slip.", 105, 275, { align: "center" });

  pdf.save(`Payslip-${p.employeeName.replace(/\s+/g, "-")}-${p.periodLabel.replace(/\s+/g, "-")}.pdf`);
};
