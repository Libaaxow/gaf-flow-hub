import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InvoiceTemplate } from "./InvoiceTemplate";
import { generateInvoicePDF } from "@/utils/generateInvoicePDF";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export const InvoiceDialog = ({ open, onOpenChange, order }: InvoiceDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  if (!order) return null;

  // Parse order items - handle both orders and invoices with area-based support
  console.log("Invoice Dialog - Full Order Data:", order);
  console.log("Invoice items raw:", order.invoice_items);
  console.log("Order items raw:", order.order_items);
  
  const items = order.invoice_items && Array.isArray(order.invoice_items) && order.invoice_items.length > 0
    ? order.invoice_items.map((item: any) => {
        console.log("Parsing invoice item:", item);
        const isAreaBased = item.sale_type === 'area' || (item.area_m2 && item.area_m2 > 0);
        // Get product name from nested product relation or use description
        const productName = item.product?.name || item.products?.name || null;
        return {
          description: item.description || "Item",
          productName: productName,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unit_price) || Number(item.rate_per_m2) || 0,
          amount: Number(item.amount) || 0,
          // Area-based fields
          saleType: item.sale_type || 'unit',
          widthM: isAreaBased ? Number(item.width_m) || 0 : undefined,
          heightM: isAreaBased ? Number(item.height_m) || 0 : undefined,
          areaM2: isAreaBased ? Number(item.area_m2) || 0 : undefined,
          ratePerM2: isAreaBased ? Number(item.rate_per_m2) || Number(item.unit_price) || 0 : undefined,
        };
      })
    : order.order_items && Array.isArray(order.order_items) && order.order_items.length > 0
    ? order.order_items.map((item: any) => {
        console.log("Parsing order item:", item);
        return {
          description: item.description || item.item_name || "Item",
          productName: item.product?.name || item.products?.name || null,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unit_price) || 0,
          amount: (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
          saleType: 'unit',
        };
      })
    : [{
        description: order.job_title || order.description || "Service",
        productName: null,
        quantity: Number(order.quantity) || 1,
        unitPrice: Number(order.order_value || order.total_amount || order.subtotal) || 0,
        amount: Number(order.order_value || order.total_amount || order.subtotal) || 0,
        saleType: 'unit',
      }];

  console.log("Invoice Dialog - Parsed Items:", items);

  // Get customer info
  const customerName = order.customer?.name || order.customers?.name || order.customer_name || "N/A";
  const customerContact = order.customer?.phone || order.customers?.phone || "";
  const customerEmail = order.customer?.email || order.customers?.email || "";
  const customerAddress = order.customer?.address || order.customers?.address || "";
  
  // Get salesperson name
  const salesperson = order.salesperson?.full_name || order.salesperson_name || "";
  
  // Get payment method
  const paymentMethod = order.payment_method ? 
    order.payment_method.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) : 
    "Cash";

  // Calculate totals
  const totalAmount = Number(order.total_amount || order.order_value || order.subtotal) || 0;
  const amountPaid = Number(order.amount_paid) || 0;
  
  // Get discount info from payments
  const discountAmount = order.payments?.reduce((sum: number, p: any) => sum + (Number(p.discount_amount) || 0), 0) || 0;
  const discountReason = order.payments?.find((p: any) => p.discount_reason)?.discount_reason || "";

  const status = (
    order.status === "paid" || order.payment_status === "paid"
      ? "PAID"
      : order.status === "partial" || order.payment_status === "partial"
      ? "PARTIAL"
      : "UNPAID"
  ) as "PAID" | "UNPAID" | "PARTIAL";

  const handleDownloadPDF = () => {
    setIsGenerating(true);
    
    try {
      console.log("Preparing invoice data...");
      console.log("Order:", order);
      console.log("Items:", items);
      
      const invoiceData = {
        invoiceNumber: order.invoice_number || order.id || "N/A",
        invoiceDate: format(new Date(order.invoice_date || order.created_at || Date.now()), "dd.MM.yyyy"),
        customerName,
        customerContact,
        customerEmail,
        customerAddress,
        salesperson,
        paymentMethod,
        projectName: order.project_name || "",
        items,
        status,
        amountPaid,
        totalAmount,
      };
      
      console.log("Invoice data prepared:", invoiceData);
      const success = generateInvoicePDF(order.invoice_number || order.id, invoiceData);
      
      if (success) {
        toast({
          title: "Success",
          description: "Invoice downloaded successfully!",
        });
      }
    } catch (error) {
      console.error("Error in handleDownloadPDF:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please check the console for details.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>

        <InvoiceTemplate
          invoiceNumber={order.invoice_number || order.id || "N/A"}
          invoiceDate={new Date(order.invoice_date || order.created_at || Date.now())}
          customerName={customerName}
          customerContact={customerContact}
          customerEmail={customerEmail}
          customerAddress={customerAddress}
          salesperson={salesperson}
          paymentMethod={paymentMethod}
          projectName={order.project_name || ""}
          items={items}
          status={status}
          amountPaid={amountPaid}
          totalAmount={totalAmount}
          discountAmount={discountAmount}
          discountReason={discountReason}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleDownloadPDF} disabled={isGenerating}>
            <Download className="mr-2 h-4 w-4" />
            {isGenerating ? "Generating..." : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
