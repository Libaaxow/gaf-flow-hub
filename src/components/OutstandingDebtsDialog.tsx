import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Mail, Search, Building2 } from 'lucide-react';

interface CustomerDebt {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
}

interface OutstandingDebtsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const OutstandingDebtsDialog = ({ open, onOpenChange }: OutstandingDebtsDialogProps) => {
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open) {
      fetchCustomerDebts();
    }
  }, [open]);

  const fetchCustomerDebts = async () => {
    setLoading(true);
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
          id,
          total_amount,
          amount_paid,
          is_draft,
          customer:customers(id, name, email, phone, company_name)
        `)
        .eq('is_draft', false);

      if (error) throw error;

      // Aggregate by customer
      const customerMap: Record<string, CustomerDebt> = {};

      (invoices || []).forEach((inv: any) => {
        const customer = inv.customer;
        if (!customer) return;

        const totalAmount = Number(inv.total_amount || 0);
        const amountPaid = Number(inv.amount_paid || 0);
        const outstanding = totalAmount - amountPaid;

        if (!customerMap[customer.id]) {
          customerMap[customer.id] = {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            company_name: customer.company_name,
            totalBilled: 0,
            totalPaid: 0,
            outstanding: 0,
            invoiceCount: 0,
          };
        }

        customerMap[customer.id].totalBilled += totalAmount;
        customerMap[customer.id].totalPaid += amountPaid;
        customerMap[customer.id].outstanding += outstanding;
        customerMap[customer.id].invoiceCount += 1;
      });

      // Filter only customers with outstanding > 0 and sort by outstanding desc
      const debts = Object.values(customerMap)
        .filter(c => c.outstanding > 0.01)
        .sort((a, b) => b.outstanding - a.outstanding);

      setCustomerDebts(debts);
    } catch (error) {
      console.error('Error fetching customer debts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDebts = customerDebts.filter(c => {
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      (c.email?.toLowerCase().includes(query) ?? false) ||
      (c.phone?.toLowerCase().includes(query) ?? false) ||
      (c.company_name?.toLowerCase().includes(query) ?? false)
    );
  });

  const totalOutstanding = filteredDebts.reduce((sum, c) => sum + c.outstanding, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <Phone className="h-5 w-5" />
            Customers Due to Pay
          </DialogTitle>
          <DialogDescription>
            {filteredDebts.length} customer{filteredDebts.length !== 1 ? 's' : ''} with outstanding balance totaling{' '}
            <span className="font-semibold text-orange-600">
              ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="max-h-[55vh]">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
            </div>
          ) : filteredDebts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No matching customers found.' : 'No customers with outstanding balances.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Total Billed</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDebts.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        {customer.company_name && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {customer.company_name}
                          </p>
                        )}
                        <Badge variant="outline" className="mt-1 text-xs">
                          {customer.invoiceCount} invoice{customer.invoiceCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {customer.phone && (
                          <a
                            href={`tel:${customer.phone}`}
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </a>
                        )}
                        {customer.email && (
                          <a
                            href={`mailto:${customer.email}`}
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </a>
                        )}
                        {!customer.phone && !customer.email && (
                          <span className="text-xs text-muted-foreground">No contact info</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${customer.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-600">
                      ${customer.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-red-600">
                      ${customer.outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
