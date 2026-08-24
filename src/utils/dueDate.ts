// Standard payment terms: 30 days from the invoice date
export const DEFAULT_PAYMENT_TERM_DAYS = 30;

/** Returns a yyyy-MM-dd string 30 days after the given date (default: today). */
export const defaultDueDate = (from?: string | Date): string => {
  const base = from ? new Date(from) : new Date();
  if (isNaN(base.getTime())) return defaultDueDate();
  base.setDate(base.getDate() + DEFAULT_PAYMENT_TERM_DAYS);
  return base.toISOString().split('T')[0];
};

/** Effective due date for an invoice, falling back to invoice_date + 30 days. */
export const effectiveDueDate = (invoice: { due_date?: string | null; invoice_date?: string | null; created_at?: string | null }): string =>
  invoice.due_date || defaultDueDate(invoice.invoice_date || invoice.created_at || undefined);
