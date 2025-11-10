import { useState } from "react";
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

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export const InvoiceDialog = ({ open, onOpenChange, order }: InvoiceDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      await generateInvoicePDF(order.id);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!order) return null;

  // Parse order items from the order data
  const items = order.order_items?.map((item: any) => ({
    description: item.description || item.item_name || "Item",
    quantity: item.quantity || 1,
    unitPrice: item.unit_price || 0,
    amount: (item.quantity || 1) * (item.unit_price || 0),
  })) || [{
    description: order.job_title || "Service",
    quantity: 1,
    unitPrice: order.order_value || 0,
    amount: order.order_value || 0,
  }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>

        <InvoiceTemplate
          invoiceNumber={order.id || "N/A"}
          invoiceDate={new Date(order.created_at || Date.now())}
          customerName={order.customers?.name || order.customer_name || "N/A"}
          customerContact={order.customers?.phone || order.customers?.email}
          items={items}
          status={
            order.payment_status === "paid"
              ? "PAID"
              : order.payment_status === "partial"
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
