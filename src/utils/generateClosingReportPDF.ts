import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import logoImg from "@/assets/gaf-media-logo-full.png";

const BRAND: [number, number, number] = [218, 34, 39];
const NAVY: [number, number, number] = [57, 61, 140];

export interface ClosingInvoice {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  status: string;
  customer_name: string;
}

export interface ClosingPayment {
  amount: number;
  payment_date: string;
  payment_method: string;
}

export interface ClosingExpense {
  category: string;
  amount: number;
  expense_date: string;
}

export interface ClosingAsset {
  asset_name: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  status: string;
}

export interface ClosingLiability {
  title: string;
  vendor_name: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
}

export interface ClosingShareholder {
  id: string;
  full_name: string;
  share_percentage: number;
  capital_invested: number;
  withdrawals: number;
  profit_share: number;
  outstanding_loan: number;
}

export interface ClosingReportData {
  periodLabel: string;
  openingBalance: number;
  invoices: ClosingInvoice[];
  payments: ClosingPayment[];
  expenses: ClosingExpense[];
  assets: ClosingAsset[];
  liabilities: ClosingLiability[];
  vendorBillsDue: number;
  shareholders: ClosingShareholder[];
  reservePercentage: number;
}

const money = (n: number) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const drawHeader = (pdf: jsPDF, title: string, subtitle: string) => {
  try {
    pdf.addImage(logoImg, "PNG", 20, 12, 46, 18);
  } catch (_) {
    /* logo optional */
  }
  pdf.setFontSize(9);
  pdf.setTextColor(51, 51, 51);
  pdf.setFont(undefined, "bold");
  pdf.text("GAF MEDIA", 190, 17, { align: "right" });
  pdf.setFont(undefined, "normal");
  pdf.setTextColor(102, 102, 102);
  pdf.text("Shanemo Shatrale, Baidoa, Somalia", 190, 22, { align: "right" });
  pdf.text("Phone: 0619130707  |  gafmedia02@gmail.com", 190, 27, { align: "right" });

  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.5);
  pdf.line(20, 34, 190, 34);

  pdf.setFontSize(16);
  pdf.setTextColor(...BRAND);
  pdf.setFont(undefined, "bold");
  pdf.text(title, 20, 44);

  pdf.setFontSize(9);
  pdf.setTextColor(102, 102, 102);
  pdf.setFont(undefined, "normal");
  pdf.text(subtitle, 20, 50);
  pdf.text(`Generated: ${format(new Date(), "MMMM dd, yyyy HH:mm")}`, 190, 50, { align: "right" });

  return 58;
};

const sectionTitle = (pdf: jsPDF, text: string, y: number) => {
  pdf.setFillColor(...NAVY);
  pdf.roundedRect(20, y, 170, 8, 1.5, 1.5, "F");
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont(undefined, "bold");
  pdf.text(text, 24, y + 5.6);
  return y + 13;
};

const statCards = (
  pdf: jsPDF,
  y: number,
  items: { label: string; value: string; color?: [number, number, number] }[],
) => {
  const perRow = 3;
  const w = 55;
  const h = 20;
  items.forEach((item, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = 20 + col * (w + 2.5);
    const cy = y + row * (h + 4);
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(x, cy, w, h, 2, 2, "FD");
    pdf.setFontSize(7.5);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text(item.label.toUpperCase(), x + 4, cy + 7);
    pdf.setFontSize(11);
    pdf.setTextColor(...(item.color || [30, 41, 59]));
    pdf.setFont(undefined, "bold");
    pdf.text(item.value, x + 4, cy + 15);
  });
  const rows = Math.ceil(items.length / perRow);
  return y + rows * (h + 4) + 2;
};

const footerAll = (pdf: jsPDF) => {
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(230, 230, 230);
    pdf.line(20, 283, 190, 283);
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 140, 140);
    pdf.setFont(undefined, "normal");
    pdf.text("GAF MEDIA — Confidential Closing Report", 20, 288);
    pdf.text(`Page ${i} of ${pages}`, 190, 288, { align: "right" });
  }
};

const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86400000);

export const generateClosingReportPDF = (data: ClosingReportData) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ---------- Totals ----------
  const collected = data.payments.reduce((s, p) => s + (p.amount || 0), 0);
  const expensesTotal = data.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const cashBalance = data.openingBalance + collected - expensesTotal;
  const totalInvoiced = data.invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const receivables = data.invoices.reduce(
    (s, i) => s + Math.max(0, (i.total_amount || 0) - (i.amount_paid || 0)),
    0,
  );
  const fixedAssets = data.assets.reduce((s, a) => s + (a.total_value || 0), 0);
  const payablesDue = data.liabilities.reduce(
    (s, l) => s + Math.max(0, (l.amount || 0) - (l.paid_amount || 0)),
    0,
  );
  const totalLiabilities = payablesDue + data.vendorBillsDue;
  const shareholderLoans = data.shareholders.reduce((s, sh) => s + (sh.outstanding_loan || 0), 0);
  const totalAssets = cashBalance + receivables + fixedAssets + shareholderLoans;
  const netWorth = totalAssets - totalLiabilities;
  const cashAfterPayables = Math.max(0, cashBalance - totalLiabilities);
  const reserve = cashAfterPayables * data.reservePercentage;
  const distributable = cashAfterPayables - reserve;
  const netProfit = data.openingBalance + collected - expensesTotal;

  // ---------- 1. Executive summary ----------
  let y = drawHeader(pdf, "FULL CLOSING REPORT", data.periodLabel);
  y = sectionTitle(pdf, "1. EXECUTIVE SUMMARY", y);
  y = statCards(pdf, y, [
    { label: "Opening Balance", value: money(data.openingBalance) },
    { label: "Cash Collected", value: money(collected), color: [22, 163, 74] },
    { label: "Total Expenses", value: money(expensesTotal), color: [220, 38, 38] },
    { label: "Cash Balance", value: money(cashBalance), color: [22, 163, 74] },
    { label: "Receivables", value: money(receivables), color: [234, 88, 12] },
    { label: "Liabilities", value: money(totalLiabilities), color: [220, 38, 38] },
    { label: "Fixed Assets", value: money(fixedAssets), color: [37, 99, 235] },
    { label: "Net Company Worth", value: money(netWorth), color: netWorth >= 0 ? [22, 163, 74] : [220, 38, 38] },
    { label: "Distributable Cash", value: money(distributable), color: NAVY },
  ]);

  y += 2;
  autoTable(pdf, {
    startY: y,
    head: [["How these numbers are built", "Amount"]],
    body: [
      ["Opening balance recorded in the system", money(data.openingBalance)],
      ["+ Payments actually collected from customers", money(collected)],
      ["- Approved expenses paid out", `(${money(expensesTotal)})`],
      ["= Cash balance on hand", money(cashBalance)],
      ["+ Money still owed by customers (receivables)", money(receivables)],
      ["+ Value of company fixed assets", money(fixedAssets)],
      ["+ Loans owed by shareholders to the company", money(shareholderLoans)],
      ["- Company liabilities and vendor bills", `(${money(totalLiabilities)})`],
      ["= NET COMPANY WORTH", money(netWorth)],
    ],
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [51, 51, 51] },
    columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    margin: { left: 20, right: 20 },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === 8) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fillColor = [240, 249, 244];
      }
    },
  });

  // ---------- 2. Cash & profit ----------
  pdf.addPage();
  y = drawHeader(pdf, "CASH, INCOME & EXPENSES", data.periodLabel);
  y = sectionTitle(pdf, "2. CASH MOVEMENT & PROFITABILITY", y);
  y = statCards(pdf, y, [
    { label: "Total Invoiced", value: money(totalInvoiced), color: NAVY },
    { label: "Collected", value: money(collected), color: [22, 163, 74] },
    { label: "Net Profit", value: money(netProfit), color: netProfit >= 0 ? [22, 163, 74] : [220, 38, 38] },
  ]);

  const byMethod = new Map<string, number>();
  data.payments.forEach((p) => {
    const k = (p.payment_method || "other").replace(/_/g, " ");
    byMethod.set(k, (byMethod.get(k) || 0) + (p.amount || 0));
  });
  autoTable(pdf, {
    startY: y + 2,
    head: [["Collections by Payment Method", "Amount", "% of Collected"]],
    body: Array.from(byMethod.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [
        k.toUpperCase(),
        money(v),
        collected > 0 ? `${((v / collected) * 100).toFixed(1)}%` : "0%",
      ]),
    foot: [["TOTAL", money(collected), "100%"]],
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 20, right: 20 },
  });

  const byCategory = new Map<string, number>();
  data.expenses.forEach((e) => {
    const k = e.category || "Uncategorized";
    byCategory.set(k, (byCategory.get(k) || 0) + (e.amount || 0));
  });
  autoTable(pdf, {
    startY: (pdf as any).lastAutoTable.finalY + 8,
    head: [["Expenses by Category", "Amount", "% of Expenses"]],
    body: Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [
        k,
        money(v),
        expensesTotal > 0 ? `${((v / expensesTotal) * 100).toFixed(1)}%` : "0%",
      ]),
    foot: [["TOTAL", money(expensesTotal), "100%"]],
    theme: "striped",
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [254, 242, 242], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 20, right: 20 },
  });

  // ---------- 3. Receivables ----------
  pdf.addPage();
  y = drawHeader(pdf, "ACCOUNTS RECEIVABLE", data.periodLabel);
  y = sectionTitle(pdf, "3. MONEY OWED BY CUSTOMERS", y);

  const today = new Date();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  const perCustomer = new Map<string, number>();
  const openInvoices: ClosingInvoice[] = [];
  data.invoices.forEach((inv) => {
    const due = Math.max(0, (inv.total_amount || 0) - (inv.amount_paid || 0));
    if (due <= 0.009) return;
    openInvoices.push(inv);
    perCustomer.set(inv.customer_name, (perCustomer.get(inv.customer_name) || 0) + due);
    const ref = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
    const age = daysBetween(today, ref);
    if (age <= 0) buckets.current += due;
    else if (age <= 30) buckets.d30 += due;
    else if (age <= 60) buckets.d60 += due;
    else buckets.d90 += due;
  });

  y = statCards(pdf, y, [
    { label: "Not Yet Due", value: money(buckets.current), color: [22, 163, 74] },
    { label: "1 - 30 Days Late", value: money(buckets.d30), color: [234, 179, 8] },
    { label: "31 - 60 Days Late", value: money(buckets.d60), color: [234, 88, 12] },
    { label: "60+ Days Late", value: money(buckets.d90), color: [220, 38, 38] },
    { label: "Open Invoices", value: `${openInvoices.length}`, color: NAVY },
    { label: "Total Receivable", value: money(receivables), color: [234, 88, 12] },
  ]);

  autoTable(pdf, {
    startY: y + 2,
    head: [["Customer", "Outstanding"]],
    body: Array.from(perCustomer.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, money(v)]),
    foot: [["TOTAL OUTSTANDING", money(receivables)]],
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: "right", cellWidth: 45 } },
    margin: { left: 20, right: 20 },
  });

  autoTable(pdf, {
    startY: (pdf as any).lastAutoTable.finalY + 8,
    head: [["Invoice", "Customer", "Date", "Due Date", "Total", "Paid", "Balance"]],
    body: openInvoices
      .sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1))
      .map((i) => [
        i.invoice_number,
        i.customer_name,
        i.invoice_date,
        i.due_date || "-",
        money(i.total_amount),
        money(i.amount_paid),
        money((i.total_amount || 0) - (i.amount_paid || 0)),
      ]),
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 20, right: 20 },
  });

  // ---------- 4. Assets & liabilities ----------
  pdf.addPage();
  y = drawHeader(pdf, "ASSETS & LIABILITIES", data.periodLabel);
  y = sectionTitle(pdf, "4. COMPANY FIXED ASSETS", y);
  autoTable(pdf, {
    startY: y,
    head: [["Asset", "Qty", "Unit Price", "Total Value", "Condition"]],
    body: data.assets.map((a) => [
      a.asset_name,
      String(a.quantity),
      money(a.unit_price),
      money(a.total_value),
      (a.status || "").replace(/_/g, " ").toUpperCase(),
    ]),
    foot: [["TOTAL ASSETS", "", "", money(fixedAssets), ""]],
    theme: "striped",
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9 },
    footStyles: { fillColor: [239, 246, 255], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: 20, right: 20 },
  });

  y = sectionTitle(pdf, "5. LIABILITIES & PAYABLES", (pdf as any).lastAutoTable.finalY + 8);
  autoTable(pdf, {
    startY: y,
    head: [["Liability", "Vendor", "Due Date", "Amount", "Paid", "Remaining", "Status"]],
    body: data.liabilities.map((l) => [
      l.title,
      l.vendor_name || "-",
      l.due_date || "-",
      money(l.amount),
      money(l.paid_amount),
      money(Math.max(0, (l.amount || 0) - (l.paid_amount || 0))),
      (l.status || "").replace(/_/g, " ").toUpperCase(),
    ]),
    foot: [["TOTAL PAYABLES", "", "", "", "", money(payablesDue), ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [254, 242, 242], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 8.5 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
    margin: { left: 20, right: 20 },
  });

  autoTable(pdf, {
    startY: (pdf as any).lastAutoTable.finalY + 8,
    head: [["Balance Sheet Position", "Amount"]],
    body: [
      ["Cash balance", money(cashBalance)],
      ["Accounts receivable", money(receivables)],
      ["Fixed assets", money(fixedAssets)],
      ["Shareholder loans receivable", money(shareholderLoans)],
      ["Total assets", money(totalAssets)],
      ["Company payables", `(${money(payablesDue)})`],
      ["Unpaid vendor bills", `(${money(data.vendorBillsDue)})`],
      ["NET COMPANY WORTH", money(netWorth)],
    ],
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 1: { halign: "right", cellWidth: 50 } },
    margin: { left: 20, right: 20 },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === 7) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fillColor = [240, 249, 244];
      }
    },
  });

  // ---------- 6. Shareholder settlement overview ----------
  pdf.addPage();
  y = drawHeader(pdf, "SHAREHOLDER SETTLEMENT", data.periodLabel);
  y = sectionTitle(pdf, "6. DISTRIBUTION BASIS", y);
  y = statCards(pdf, y, [
    { label: "Cash Balance", value: money(cashBalance), color: [22, 163, 74] },
    { label: `Reserve (${(data.reservePercentage * 100).toFixed(0)}%)`, value: money(reserve), color: NAVY },
    { label: "Distributable Cash", value: money(distributable), color: [22, 163, 74] },
  ]);

  autoTable(pdf, {
    startY: y + 2,
    head: [["Shareholder", "Share %", "Net Worth Share", "Gross Cash Share", "Loan Deduction", "Net Payout"]],
    body: data.shareholders.map((sh) => {
      const pct = (sh.share_percentage || 0) / 100;
      const gross = distributable * pct;
      const deduction = Math.min(gross, sh.outstanding_loan || 0);
      return [
        sh.full_name,
        `${sh.share_percentage}%`,
        money(netWorth * pct),
        money(gross),
        `(${money(deduction)})`,
        money(Math.max(0, gross - (sh.outstanding_loan || 0))),
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 20, right: 20 },
  });

  // ---------- 7. One clean page per shareholder ----------
  data.shareholders.forEach((sh) => {
    pdf.addPage();
    const pct = (sh.share_percentage || 0) / 100;
    const gross = distributable * pct;
    const loan = sh.outstanding_loan || 0;
    const deduction = Math.min(gross, loan);
    const netPayout = Math.max(0, gross - loan);
    const remainingLoan = Math.max(0, loan - gross);

    let sy = drawHeader(pdf, "SHAREHOLDER STATEMENT", `${sh.full_name} — ${data.periodLabel}`);
    sy = sectionTitle(pdf, `OWNERSHIP: ${sh.share_percentage}% OF GAF MEDIA`, sy);
    sy = statCards(pdf, sy, [
      { label: "Net Worth Share", value: money(netWorth * pct), color: NAVY },
      { label: "Net Cash Payout", value: money(netPayout), color: [22, 163, 74] },
      { label: "Outstanding Loan", value: money(remainingLoan), color: remainingLoan > 0 ? [220, 38, 38] : [22, 163, 74] },
    ]);

    autoTable(pdf, {
      startY: sy + 2,
      head: [["Step-by-step calculation of this payout", "Amount"]],
      body: [
        ["Company cash balance", money(cashBalance)],
        ["Less: company liabilities and vendor bills", `(${money(totalLiabilities)})`],
        ["Cash available after settling debts", money(cashAfterPayables)],
        [`Less: company reserve kept for operations (${(data.reservePercentage * 100).toFixed(0)}%)`, `(${money(reserve)})`],
        ["Distributable cash for all shareholders", money(distributable)],
        [`Your ownership share (${sh.share_percentage}%)`, money(gross)],
        ["Less: your outstanding loan settled from this share", `(${money(deduction)})`],
        ["YOUR NET CASH PAYOUT", money(netPayout)],
      ],
      theme: "grid",
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 1: { halign: "right", cellWidth: 50 } },
      margin: { left: 20, right: 20 },
      didParseCell: (d) => {
        if (d.section === "body" && d.row.index === 7) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.fillColor = [240, 249, 244];
        }
      },
    });

    autoTable(pdf, {
      startY: (pdf as any).lastAutoTable.finalY + 8,
      head: [["Your account history with the company", "Amount"]],
      body: [
        ["Capital invested", money(sh.capital_invested)],
        ["Profit shares received", money(sh.profit_share)],
        ["Withdrawals taken", `(${money(sh.withdrawals)})`],
        ["Loans taken (still unpaid)", money(loan)],
        ["Loan balance remaining after this payout", money(remainingLoan)],
      ],
      theme: "striped",
      headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 1: { halign: "right", cellWidth: 50 } },
      margin: { left: 20, right: 20 },
    });

    const noteY = (pdf as any).lastAutoTable.finalY + 10;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, noteY, 170, 22, 2, 2, "F");
    pdf.setFontSize(8);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text(
      "This statement is generated directly from the recorded invoices, payments, expenses, assets and",
      25,
      noteY + 8,
    );
    pdf.text(
      "liabilities in the GAF Media system. Figures reflect the data available at the time of generation.",
      25,
      noteY + 13,
    );
    pdf.text(`Signature: ______________________     Date: ______________`, 25, noteY + 19);
  });

  footerAll(pdf);
  pdf.save(`GAF-Closing-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
};
