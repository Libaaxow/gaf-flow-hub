import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { REPORT_NAVY, REPORT_RED, addReportFooters, drawReportHeader, drawReportSummary, reportMoney, reportStatus, reportTableStyles } from "@/utils/reportPdfStyle";

interface Expense { amount: number; category: string; expense_date: string; description: string; supplier_name?: string; payment_method: string; approval_status: string; notes?: string }
interface FilterOptions { dateFrom?: Date; dateTo?: Date; expenseCategory?: string }

export const generateExpensesReportPDF = (expenses: Expense[], filters: FilterOptions) => {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const byCategory = expenses.reduce<Record<string, number>>((result, expense) => ({ ...result, [expense.category || "Uncategorized"]: (result[expense.category || "Uncategorized"] || 0) + Number(expense.amount || 0) }), {});
  const filterText = [filters.dateFrom && `From ${format(filters.dateFrom, "dd MMM yyyy")}`, filters.dateTo && `To ${format(filters.dateTo, "dd MMM yyyy")}`, filters.expenseCategory && filters.expenseCategory !== "all" && `Category: ${filters.expenseCategory}`].filter(Boolean).join("  |  ");
  let y = drawReportHeader(pdf, "EXPENSES REPORT", filterText || "All matching expense records");
  y = drawReportSummary(pdf, y, [{ label: "Transactions", value: String(expenses.length) }, { label: "Total expenses", value: reportMoney(total), color: REPORT_RED }, { label: "Categories", value: String(Object.keys(byCategory).length), color: REPORT_NAVY }]);
  autoTable(pdf, {
    startY: y,
    head: [["Date", "Description / Notes", "Category", "Supplier", "Method", "Status", "Amount"]],
    body: expenses.map((expense) => [format(new Date(expense.expense_date), "dd MMM yyyy"), [expense.description, expense.notes].filter(Boolean).join("\n"), reportStatus(expense.category), expense.supplier_name || "—", reportStatus(expense.payment_method), reportStatus(expense.approval_status), reportMoney(expense.amount)]),
    foot: [["Grand total", "", "", "", "", "", reportMoney(total)]],
    ...reportTableStyles,
    footStyles: { fillColor: [248, 250, 252], textColor: REPORT_NAVY, fontStyle: "bold" },
    columnStyles: { 1: { cellWidth: 68 }, 2: { cellWidth: 38 }, 3: { cellWidth: 38 }, 6: { halign: "right", fontStyle: "bold" } },
  });
  y = (pdf as any).lastAutoTable.finalY + 10;
  if (y > 175) { pdf.addPage(); y = drawReportHeader(pdf, "EXPENSE CATEGORY BREAKDOWN"); }
  autoTable(pdf, { startY: y, head: [["Category", "Amount", "% of total"]], body: Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([category, amount]) => [category, reportMoney(amount), total ? `${((amount / total) * 100).toFixed(1)}%` : "0.0%"]), ...reportTableStyles, columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" } }, tableWidth: 150 });
  addReportFooters(pdf, "Expenses Report");
  pdf.save(`Expenses-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  return true;
};