import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const generateInvoicePDF = async (invoiceNumber: string) => {
  const element = document.getElementById("invoice-template");
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const imgWidth = 210;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
  pdf.save(`Invoice-${invoiceNumber}.pdf`);
};
