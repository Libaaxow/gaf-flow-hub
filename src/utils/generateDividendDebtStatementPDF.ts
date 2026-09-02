import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface StatementShareholderRow {
  name: string;
  pct: number;
  netWorthShare: number;
  gross: number;
  deduction: number;
  net: number;
  remaining: number;
}

export interface StatementDividend {
  reference_no: string;
  declaration_date: string;
  payment_date: string | null;
  dividend_amount: number;
  dividend_per_share: number;
  status: string;
}

interface StatementData {
  netCompanyWorth: number;
  cashBalance: number;
  totalReceivables: number;
  fixedAssets: number;
  companyLiabilities: number;
  companyReserve: number;
  distributableCash: number;
  reservePercentage: number;
  shareholders: StatementShareholderRow[];
  dividends: StatementDividend[];
}

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function generateDividendDebtStatementPDF(data: StatementData) {
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  doc.setFontSize(16);
  doc.text('Dividend & Debt Statement', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generated: ${today}`, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    head: [['Company Financial Position', 'Amount']],
    body: [
      ['Cash Balance', money(data.cashBalance)],
      ['Total Receivables', money(data.totalReceivables)],
      ['Fixed Assets', money(data.fixedAssets)],
      ['Company Liabilities', money(data.companyLiabilities)],
      ['Net Company Worth', money(data.netCompanyWorth)],
      [`Company Reserve (${data.reservePercentage * 100}%)`, money(data.companyReserve)],
      ['Distributable Cash', money(data.distributableCash)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [57, 61, 140] },
    styles: { fontSize: 9 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [['Shareholder', 'Ownership %', 'Net Worth Share', 'Gross Cash Share', 'Loan Deduction', 'Net Payout', 'Remaining Debt']],
    body: data.shareholders.map((s) => [
      s.name,
      `${s.pct}%`,
      money(s.netWorthShare),
      money(s.gross),
      money(s.deduction),
      money(s.net),
      money(s.remaining),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [218, 34, 39] },
    styles: { fontSize: 9 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [['Declared Dividends', 'Declared', 'Payment Date', 'Amount', 'Per Share', 'Status']],
    body: data.dividends.length
      ? data.dividends.map((d) => [
          d.reference_no,
          d.declaration_date,
          d.payment_date || '-',
          money(d.dividend_amount),
          money(d.dividend_per_share),
          d.status,
        ])
      : [['No dividends declared', '', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [57, 61, 140] },
    styles: { fontSize: 9 },
  });

  doc.save(`dividend-debt-statement-${new Date().toISOString().slice(0, 10)}.pdf`);
}
