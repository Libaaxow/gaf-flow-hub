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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Phone, Mail, Search, Building2, ChevronDown, ChevronRight } from 'lucide-react';

interface InvoiceDebt {
  id: string;
  invoice_number: string;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  status: string;
  invoice_date: string;
}

interface CustomerDebt {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  invoices: InvoiceDebt[];
}

interface OutstandingDebtsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const OutstandingDebtsDialog = ({ open, onOpenChange }: OutstandingDebtsDialogProps) => {
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      fetchCustomerDebts();
      setExpandedCustomers(new Set());
    }
  }, [open]);

  const fetchCustomerDebts = async () => {
    setLoading(true);
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          total_amount,
          amount_paid,
          status,
          invoice_date,
          is_draft,
          customer:customers(id, name, email, phone, company_name)
        `)
        .eq('is_draft', false);

      if (error) throw error;

      const customerMap: Record<string, CustomerDebt> = {};

      (invoices || []).forEach((inv: any) => {
        const customer = inv.customer;
        if (!customer) return;

        const totalAmount = Number(inv.total_amount || 0);
        const amountPaid = Number(inv.amount_paid || 0);
        const outstanding = totalAmount - amountPaid;

        // Only include invoices that still have outstanding balance
        if (outstanding <= 0.01) return;

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
            invoices: [],
          };
        }

        customerMap[customer.id].totalBilled += totalAmount;
        customerMap[customer.id].totalPaid += amountPaid;
        customerMap[customer.id].outstanding += outstanding;
        customerMap[customer.id].invoices.push({
          id: inv.id,
          invoice_number: inv.invoice_number,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          outstanding,
          status: inv.status,
          invoice_date: inv.invoice_date,
        });
      });

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

  const toggleCustomer = (customerId: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  const getInvoiceStatusBadge = (inv: InvoiceDebt) => {
    if (inv.amount_paid > 0 && inv.outstanding > 0) {
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-[10px]">Partially Paid</Badge>;
    }
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-[10px]">Unpaid</Badge>;
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
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <Phone className="h-5 w-5" />
            Customers Due to Pay
          </DialogTitle>
          <DialogDescription>
            {filteredDebts.length} customer{filteredDebts.length !== 1 ? 's' : ''} with outstanding balance totaling{' '}
            <span className="font-semibold text-orange-600">${fmt(totalOutstanding)}</span>
            {' · '}Click a row to see invoice details.
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
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Total Billed</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDebts.map((customer) => {
                  const isExpanded = expandedCustomers.has(customer.id);
                  return (
                    <Collapsible key={customer.id} open={isExpanded} onOpenChange={() => toggleCustomer(customer.id)} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="w-8 px-2">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </TableCell>
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
                                  {customer.invoices.length} invoice{customer.invoices.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {customer.phone && (
                                  <a
                                    href={`tel:${customer.phone}`}
                                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Phone className="h-3 w-3" />
                                    {customer.phone}
                                  </a>
                                )}
                                {customer.email && (
                                  <a
                                    href={`mailto:${customer.email}`}
                                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
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
                              ${fmt(customer.totalBilled)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-green-600">
                              ${fmt(customer.totalPaid)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold text-red-600">
                              ${fmt(customer.outstanding)}
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <>
                            {customer.invoices
                              .sort((a, b) => b.outstanding - a.outstanding)
                              .map((inv) => (
                                <TableRow key={inv.id} className="bg-muted/30">
                                  <TableCell></TableCell>
                                  <TableCell colSpan={2}>
                                    <div className="flex items-center gap-2 pl-2">
                                      <span className="text-xs font-mono text-muted-foreground">{inv.invoice_number}</span>
                                      {getInvoiceStatusBadge(inv)}
                                      <span className="text-[10px] text-muted-foreground">{inv.invoice_date}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    ${fmt(inv.total_amount)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs text-green-600">
                                    -${fmt(inv.amount_paid)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs font-semibold text-red-600">
                                    ${fmt(inv.outstanding)}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
