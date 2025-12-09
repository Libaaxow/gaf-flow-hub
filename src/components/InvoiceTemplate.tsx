import { format } from "date-fns";
import logo from "@/assets/gaf-media-logo-poster.png";
import qrCode from "@/assets/qr-code-gaf.png";

interface InvoiceItem {
  description: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  // Area-based fields
  saleType?: string;
  widthM?: number;
  heightM?: number;
  areaM2?: number;
  ratePerM2?: number;
}

interface InvoiceTemplateProps {
  invoiceNumber: string;
  invoiceDate: Date;
  customerName: string;
  customerContact?: string;
  customerEmail?: string;
  customerAddress?: string;
  salesperson?: string;
  paymentMethod?: string;
  items: InvoiceItem[];
  status: "PAID" | "UNPAID" | "PARTIAL";
  amountPaid?: number;
  totalAmount?: number;
}

export const InvoiceTemplate = ({
  invoiceNumber,
  invoiceDate,
  customerName,
  customerContact,
  customerEmail,
  customerAddress,
  salesperson,
  paymentMethod,
  items,
  status,
  amountPaid = 0,
  totalAmount,
}: InvoiceTemplateProps) => {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const total = totalAmount ?? subtotal;
  const amountDue = total - amountPaid;

  return (
    <div className="bg-white p-6 max-w-4xl mx-auto text-sm" id="invoice-template">
      {/* Header with Blue Bar and Logo */}
      <div className="flex justify-between items-start mb-6">
        <div className="bg-[#1e40af] text-white px-8 py-3 text-2xl font-bold tracking-wider">
          BAIDOA
        </div>
        <img src={logo} alt="GAF Media" className="h-24 object-contain" />
      </div>

      {/* Invoice Title */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-[0.3em] text-[#1e40af]">QAANSHEEG</h1>
        <p className="text-[#dc2626] text-sm tracking-[0.2em]">INVOICE</p>
      </div>

      {/* Customer and Invoice Details - Two Column Layout */}
      <div className="grid grid-cols-2 gap-x-8 mb-6 text-xs">
        {/* Left Column - Customer Info */}
        <div className="space-y-1">
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-40">Macmiilka</span>
            <span className="text-gray-500 mr-1">(Customer):</span>
            <span className="flex-1">{customerName}</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-40">Wakiilka</span>
            <span className="text-gray-500 mr-1">(Contact Person):</span>
            <span className="flex-1">{customerName}</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-40">Lambarka</span>
            <span className="text-gray-500 mr-1">(Telephone):</span>
            <span className="flex-1">{customerContact || "-"}</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-40">Emailka</span>
            <span className="text-gray-500 mr-1">(Email):</span>
            <span className="flex-1">{customerEmail || "-"}</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-40">Cinwaanka</span>
            <span className="text-gray-500 mr-1">(Address):</span>
            <span className="flex-1">{customerAddress || "Baidoa, Somalia"}</span>
          </div>
        </div>

        {/* Right Column - Invoice Info */}
        <div className="space-y-1">
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-48">Taariikhada</span>
            <span className="text-gray-500 mr-1">(Invoice Date):</span>
            <span className="flex-1">{format(invoiceDate, "dd.MM.yyyy")}</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-48">Iibiyaha</span>
            <span className="text-gray-500 mr-1">(Salesperson):</span>
            <span className="flex-1">{salesperson || "-"}</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-48">Tixraaca Qaansheegta</span>
            <span className="text-gray-500 mr-1">(Invoice#):</span>
            <span className="flex-1">{invoiceNumber}</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-48">Xarunta</span>
            <span className="text-gray-500 mr-1">(Branch):</span>
            <span className="flex-1">Baidoa</span>
          </div>
          <div className="flex">
            <span className="font-semibold text-[#1e40af] w-48">Nooca Bixinta</span>
            <span className="text-gray-500 mr-1">(Payment Method):</span>
            <span className="flex-1">{paymentMethod || "Cash"}</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-6 text-xs">
        <thead>
          <tr className="bg-[#1e40af] text-white">
            <th className="text-left py-2 px-3 font-semibold">
              <span className="text-white">Faah faahin</span>
              <span className="text-yellow-300 ml-1">(Description)</span>
            </th>
            <th className="text-center py-2 px-3 font-semibold w-28">
              <span className="text-white">Tirada/Cabir</span>
              <span className="text-yellow-300 ml-1">(Qty/Size)</span>
            </th>
            <th className="text-right py-2 px-3 font-semibold w-28">
              <span className="text-white">Qiimaha</span>
              <span className="text-yellow-300 ml-1">(Rate)</span>
            </th>
            <th className="text-right py-2 px-3 font-semibold w-28">
              <span className="text-white">Wadarta</span>
              <span className="text-yellow-300 ml-1">(Amount)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items && items.length > 0 ? (
            items.map((item, index) => {
              const isAreaBased = item.saleType === 'area' || (item.areaM2 && item.areaM2 > 0);
              const displayName = item.productName || item.description;
              return (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-2 px-3">
                    <div className="font-semibold text-[#1e40af]">{displayName}</div>
                    {item.productName && item.description && item.description !== item.productName && (
                      <div className="text-[#dc2626] text-xs mt-0.5">{item.description}</div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {isAreaBased ? (
                      <div className="text-xs">
                        <div className="font-semibold">{item.quantity || 1} × {item.widthM?.toFixed(2) || 0} × {item.heightM?.toFixed(2) || 0} m</div>
                        <div className="text-muted-foreground">{((item.areaM2 || 0) * (item.quantity || 1)).toFixed(2)} m² total</div>
                      </div>
                    ) : (
                      item.quantity
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {isAreaBased ? (
                      <div className="text-xs">
                        <div>${Number(item.unitPrice).toFixed(2)}</div>
                        <div className="text-muted-foreground">/m²</div>
                      </div>
                    ) : (
                      Number(item.unitPrice).toFixed(2)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-medium">${Number(item.amount).toFixed(2)}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={4} className="py-4 px-3 text-center text-gray-500">
                No items found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Footer with QR Code and Totals */}
      <div className="flex justify-between items-end">
        {/* QR Code Section */}
        <div className="flex items-end gap-4">
          <img src={qrCode} alt="QR Code" className="w-24 h-24" />
          <div className="text-xs">
            <p className="font-bold text-[#1e40af] uppercase">FADLAN HALKAN SCAN GIREE</p>
            <p className="font-bold text-[#1e40af] uppercase">SI AAD U BIXISO LACAGTA</p>
            <p className="text-gray-600 italic mt-1">Please Scan Here To Pay</p>
          </div>
        </div>

        {/* Totals Section */}
        <div className="text-xs w-64">
          <div className="flex justify-between py-1 border-b border-gray-200">
            <span>
              <span className="font-semibold">Wadarta Guud</span>
              <span className="text-gray-500 ml-1">(Total Amount):</span>
            </span>
            <span className="font-bold">${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-gray-200">
            <span>
              <span className="font-semibold">Canshuurta Kahor</span>
              <span className="text-gray-500 ml-1">(Untaxed Amount):</span>
            </span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-gray-200">
            <span>
              <span className="font-semibold">Canshuurta</span>
              <span className="text-gray-500 ml-1">(VAT):</span>
            </span>
            <span>$0.00</span>
          </div>
          <div className="flex justify-between py-1 border-b border-gray-200">
            <span>
              <span className="font-semibold">Lacagta La Bixiyey</span>
              <span className="text-gray-500 ml-1">(Amount Paid):</span>
            </span>
            <span>${amountPaid.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1 font-bold text-base">
            <span>
              <span className="font-semibold">Haraa</span>
              <span className="text-gray-500 ml-1">(Amount Due):</span>
            </span>
            <span className={amountDue > 0 ? "text-[#dc2626]" : "text-green-600"}>
              ${amountDue.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="text-center mt-6">
        <span className={`px-4 py-1 rounded text-sm font-bold ${
          status === "PAID" ? "bg-green-100 text-green-700" : 
          status === "PARTIAL" ? "bg-yellow-100 text-yellow-700" : 
          "bg-red-100 text-red-700"
        }`}>
          {status === "PAID" ? "PAID / LA BIXIYEY" : 
           status === "PARTIAL" ? "PARTIAL / QAYB" : 
           "UNPAID / LAMA BIXIN"}
        </span>
      </div>
    </div>
  );
};
