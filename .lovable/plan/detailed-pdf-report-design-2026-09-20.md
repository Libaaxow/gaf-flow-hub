# Detailed PDF Report Design

## Goal
Apply the polished, detailed visual style from the supplied example to every downloadable **report PDF**, without changing any saved financial records or calculations.

## What will change

### Shared report appearance
- Use one consistent GAF Media header with logo, report title, reporting period, generation date, and contact details.
- Use the dark-blue table header style shown in the example, thin row dividers, clear spacing, right-aligned money, and bold totals.
- Add consistent page numbers and report-specific footer text.
- Show status clearly using readable labels and color accents.
- Keep long descriptions, customer names, and notes wrapped instead of cut off.

### Customer reports
- For each invoice, show invoice number, date, status, billed, paid, and balance.
- Under each invoice, show every item with:
  - Description/product
  - Quantity or size
  - Width × height and calculated m² when recorded
  - Rate per piece or per m²
  - Line amount
- Show invoice totals and customer totals clearly.
- Apply the same detail to both one-customer and combined-customer downloads.

### Payment reports
- Keep received, allocated, and unallocated totals.
- Show each payment and every invoice allocation beneath it.
- Use detailed columns, clear remaining balances, payment method, reference, and payment status.

### Expense reports
- Show date, full description, category, supplier, payment method, approval status, notes, and amount.
- Keep the category breakdown and grand total.

### Liability reports
- Show each liability’s vendor, due date, status, original amount, paid amount, and remaining balance.
- Show every recorded liability item with quantity, unit rate, and line total.

### Daily activity reports
- Show the daily summary first, followed by a detailed timeline with time, action, full details, and status.

### Full closing report
- Preserve the existing executive summary, cash, profit, receivables, assets, liabilities, and shareholder calculations.
- Restyle all sections consistently.
- Add invoice item detail where available, including quantity/size, rate, and amount.
- Keep the separate shareholder statement pages.

## Data updates
- Extend report-only data requests to include product names, sale type, width, height, area, unit rate, and line amount where those values already exist.
- Do not create, edit, or delete invoices, payments, expenses, liabilities, activities, or shareholder records.
- Do not alter any financial formulas or report filters.

## Validation
- Run the project type check.
- Generate representative PDFs for customer, combined customer, payment, expense, liability, daily activity, and closing reports.
- Render PDF pages to images and inspect them for clipped text, overlaps, bad page breaks, missing details, and incorrect totals; fix and recheck any issues found.
