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
import { toast } from "sonner";

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export const InvoiceDialog = ({ open, onOpenChange, order }: InvoiceDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = () => {
    setIsGenerating(true);
    
    try {
      console.log("Preparing invoice data...");
      console.log("Order:", order);
      console.log("Items:", items);
      
      const invoiceData = {
        invoiceNumber: order.invoice_number || order.id || "N/A",
        invoiceDate: format(new Date(order.invoice_date || order.created_at || Date.now()), "MMMM d, yyyy"),
        customerName: order.customer?.name || order.customers?.name || order.customer_name || "N/A",
        customerContact: order.customer?.phone || order.customer?.email || order.customers?.phone || order.customers?.email,
        items: items,
        status: (
          order.status === "paid" || order.payment_status === "paid"
            ? "PAID"
            : order.status === "partial" || order.payment_status === "partial"
            ? "PARTIAL"
            : "UNPAID"
        ) as "PAID" | "UNPAID" | "PARTIAL",
      };
      
      console.log("Invoice data prepared:", invoiceData);
      const success = generateInvoicePDF(order.invoice_number || order.id, invoiceData);
      
      if (success) {
        toast.success("Invoice downloaded successfully!");
      }
    } catch (error) {
      console.error("Error in handleDownloadPDF:", error);
      toast.error("Failed to generate PDF. Please check the console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!order) return null;

  // Parse order items - handle both orders and invoices
  const items = order.invoice_items 
    ? order.invoice_items.map((item: any) => ({
        description: item.description || "Item",
        quantity: item.quantity || 1,
        unitPrice: item.unit_price || 0,
        amount: item.amount || 0,
      }))
    : order.order_items && order.order_items.length > 0
    ? order.order_items.map((item: any) => ({
        description: item.description || item.item_name || "Item",
        quantity: item.quantity || 1,
        unitPrice: item.unit_price || 0,
        amount: (item.quantity || 1) * (item.unit_price || 0),
      }))
    : [{
        description: order.job_title || "Service",
        quantity: 1,
        unitPrice: order.order_value || order.total_amount || 0,
        amount: order.order_value || order.total_amount || 0,
      }];

  console.log("Invoice Dialog - Order:", order);
  console.log("Invoice Dialog - Items:", items);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>

        <InvoiceTemplate
          invoiceNumber={order.invoice_number || order.id || "N/A"}
          invoiceDate={new Date(order.invoice_date || order.created_at || Date.now())}
          customerName={order.customer?.name || order.customers?.name || order.customer_name || "N/A"}
          customerContact={order.customer?.phone || order.customer?.email || order.customers?.phone || order.customers?.email}
          items={items}
          status={
            order.status === "paid" || order.payment_status === "paid"
              ? "PAID"
              : order.status === "partial" || order.payment_status === "partial"
              ? "PARTIAL"
              : "UNPAID"
          }
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
