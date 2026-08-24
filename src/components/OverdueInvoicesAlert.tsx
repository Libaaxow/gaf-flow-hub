import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, X, Eye } from 'lucide-react';
import { effectiveDueDate } from '@/utils/dueDate';
import { InvoiceDialog } from './InvoiceDialog';
import { useToast } from '@/hooks/use-toast';

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  due_date: string | null;
  invoice_date: string | null;
  total_amount: number;
  amount_paid: number;
  customers?: { name: string } | null;
}

export const OverdueInvoicesAlert = () => {
  const [overdue, setOverdue] = useState<OverdueInvoice[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, due_date, invoice_date, total_amount, amount_paid, customers(name)')
        .eq('is_draft', false)
        .neq('status', 'paid');

      const today = new Date().toISOString().split('T')[0];
      const list = (data || []).filter((inv: any) => {
        const balance = Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);
        return balance > 0.01 && effectiveDueDate(inv) < today;
      }) as OverdueInvoice[];
      setOverdue(list);
    };

    fetch();
    const interval = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleViewInvoice = async (inv: OverdueInvoice) => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(name, email, phone),
          invoice_items(
            id,
            description,
            quantity,
            unit_price,
            amount,
            product_id,
            sale_type,
            width_m,
            height_m,
            area_m2,
            rate_per_m2,
            product:products(id, name)
          ),
          payments(
            id,
            amount,
            discount_amount,
            discount_type,
            discount_reason
          )
        `)
        .eq('id', inv.id)
        .maybeSingle();

      if (error) console.error('Overdue invoice load error:', error);


      if (error || !data) {
        toast({
          title: 'Error',
          description: 'Could not load invoice details.',
          variant: 'destructive',
        });
        return;
      }

      setSelectedOrder(data);
      setDialogOpen(true);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to open invoice.',
        variant: 'destructive',
      });
    }
  };

  if (dismissed || overdue.length === 0) return null;

  const totalDue = overdue.reduce(
    (sum, i) => sum + (Number(i.total_amount || 0) - Number(i.amount_paid || 0)),
    0
  );

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 max-w-[min(20rem,calc(100vw-2rem))]">
        {open && (
          <div className="mb-2 rounded-lg border border-destructive/40 bg-card shadow-lg overflow-hidden">
            <div className="flex items-center justify-between gap-2 bg-destructive px-3 py-2 text-destructive-foreground">
              <span className="text-xs font-semibold">Overdue invoices</span>
              <button onClick={() => setDismissed(true)} aria-label="Dismiss overdue alert">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y">
              {overdue.slice(0, 20).map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => handleViewInvoice(inv)}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate flex items-center gap-1">
                      <Eye className="h-3 w-3 text-muted-foreground" />
                      {inv.invoice_number}
                    </span>
                    <span className="text-destructive font-semibold whitespace-nowrap">
                      ${(Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {inv.customers?.name || 'Customer'} · due {effectiveDueDate(inv)}
                  </div>
                </button>
              ))}
            </div>
            <div className="px-3 py-2 text-xs font-semibold border-t">
              Total overdue: ${totalDue.toFixed(2)}
            </div>
          </div>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full bg-destructive px-3 py-2 text-destructive-foreground shadow-lg text-xs font-semibold animate-pulse"
        >
          <AlertTriangle className="h-4 w-4" />
          {overdue.length} overdue invoice{overdue.length > 1 ? 's' : ''}
        </button>
      </div>

      <InvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        order={selectedOrder}
      />
    </>
  );
};
