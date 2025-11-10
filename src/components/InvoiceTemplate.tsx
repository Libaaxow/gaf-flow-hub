import { format } from "date-fns";
import logo from "@/assets/gaf-media-logo.png";

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface InvoiceTemplateProps {
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  customerContact?: string;
  items: InvoiceItem[];
  status: "PAID" | "UNPAID" | "PARTIAL";
}

export const InvoiceTemplate = ({
  invoiceNumber,
  invoiceDate,
  customerName,
  customerContact,
  items,
  status,
}: InvoiceTemplateProps) => {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="bg-white p-8 max-w-4xl mx-auto" id="invoice-template">
      {/* Header with Logo and Company Info */}
      <div className="mb-8">
        <img src={logo} alt="GAF Media" className="h-16 mb-4" />
        <div className="text-muted-foreground text-sm">
          <p>Shanemo Shatrale Baidoa Somalia</p>
          <p>Phone: 0619130707</p>
          <p>Email: gafmedia02@gmail.com</p>
        </div>
      </div>

      {/* Invoice Title */}
      <h1 className="text-4xl font-bold text-primary mb-8">INVOICE</h1>

      {/* Invoice Details and Bill To */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="mb-4">
            <p className="font-semibold">Invoice Number:</p>
            <p>{invoiceNumber}</p>
          </div>
          <div>
            <p className="font-semibold">Invoice Date:</p>
            <p>{format(invoiceDate, "MMMM d, yyyy")}</p>
          </div>
        </div>
        <div>
          <p className="font-semibold mb-2">Bill To:</p>
          <p className="font-medium">{customerName}</p>
          {customerContact && <p className="text-sm text-muted-foreground">{customerContact}</p>}
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-8 border-collapse">
        <thead>
          <tr className="border-y border-border">
            <th className="text-left py-3 px-4 font-semibold">Description</th>
            <th className="text-left py-3 px-4 font-semibold">Qty</th>
            <th className="text-left py-3 px-4 font-semibold">Unit Price</th>
            <th className="text-left py-3 px-4 font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-border">
              <td className="py-4 px-4">{item.description}</td>
              <td className="py-4 px-4">{item.quantity}</td>
              <td className="py-4 px-4">${item.unitPrice.toFixed(2)}</td>
              <td className="py-4 px-4">${item.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="flex justify-end mb-8">
        <div className="text-right">
          <p className="font-semibold text-lg mb-2">Total:</p>
          <p className="text-2xl font-bold">${total.toFixed(2)}</p>
        </div>
      </div>

      {/* Status */}
      <div className="text-center">
        <p className={`text-lg font-bold ${
          status === "PAID" ? "text-green-600" : 
          status === "PARTIAL" ? "text-yellow-600" : 
          "text-destructive"
        }`}>
          Status: {status}
        </p>
      </div>
    </div>
  );
};
