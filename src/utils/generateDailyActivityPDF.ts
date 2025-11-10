import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface ActivityItem {
  time: string;
  action: string;
  details: string;
  status?: string;
}

interface DailyActivityData {
  userRole: string;
  userName: string;
  date: Date;
  activities: ActivityItem[];
  stats: {
    label: string;
    value: string | number;
  }[];
}

export const generateDailyActivityPDF = (data: DailyActivityData) => {
  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Company Header
    pdf.setFillColor(41, 98, 255);
    pdf.roundedRect(20, 15, 40, 15, 2, 2, "F");
    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont(undefined, "bold");
    pdf.text("GAF MEDIA", 40, 24, { align: "center" });

    // Company Details
    pdf.setFontSize(9);
    pdf.setTextColor(51, 51, 51);
    pdf.setFont(undefined, "bold");
    pdf.text("GAF MEDIA", 210 - 20, 20, { align: "right" });
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(102, 102, 102);
    pdf.text("Shanemo Shatrale Baidoa Somalia", 210 - 20, 25, { align: "right" });
    pdf.text("Phone: 0619130707", 210 - 20, 30, { align: "right" });

    // Separator
    pdf.setDrawColor(230, 230, 230);
    pdf.setLineWidth(0.5);
    pdf.line(20, 42, 190, 42);

    // Report Title
    pdf.setFontSize(24);
    pdf.setTextColor(41, 98, 255);
    pdf.setFont(undefined, "bold");
    pdf.text("DAILY ACTIVITY REPORT", 20, 54);

    // User Info
    pdf.setFontSize(10);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text(`${data.userRole} - ${data.userName}`, 20, 62);
    pdf.text(`Date: ${format(data.date, "MMMM dd, yyyy")}`, 210 - 20, 62, { align: "right" });

    // Stats Section
    let yPos = 72;
    if (data.stats.length > 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(20, yPos, 170, 8 + (data.stats.length * 6), 2, 2, "F");

      pdf.setFontSize(11);
      pdf.setFont(undefined, "bold");
      pdf.setTextColor(41, 98, 255);
      pdf.text("Today's Summary", 25, yPos + 6);

      yPos += 12;
      pdf.setFontSize(9);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(51, 51, 51);

      data.stats.forEach((stat) => {
        pdf.setFont(undefined, "bold");
        pdf.text(`${stat.label}:`, 25, yPos);
        pdf.setFont(undefined, "normal");
        pdf.text(String(stat.value), 80, yPos);
        yPos += 6;
      });

      yPos += 8;
    }

    // Activities Header
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(41, 98, 255);
    pdf.text("Activity Timeline", 20, yPos);

    yPos += 5;

    // Activities Table
    if (data.activities.length > 0) {
      const tableData = data.activities.map((activity) => [
        activity.time,
        activity.action,
        activity.details,
        activity.status || "N/A",
      ]);

      autoTable(pdf, {
        startY: yPos,
        head: [["Time", "Action", "Details", "Status"]],
        body: tableData,
        theme: "plain",
        styles: {
          fontSize: 8,
          cellPadding: 3,
          textColor: [51, 51, 51],
          lineColor: [230, 230, 230],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [51, 51, 51],
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: 4,
        },
        alternateRowStyles: {
          fillColor: [252, 252, 253],
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 40 },
          2: { cellWidth: 75 },
          3: { cellWidth: 25, halign: "center" },
        },
      });
    } else {
      pdf.setFontSize(9);
      pdf.setTextColor(102, 102, 102);
      pdf.text("No activities recorded for today", 20, yPos + 10);
    }

    // Footer
    const footerY = 270;
    pdf.setDrawColor(230, 230, 230);
    pdf.line(20, footerY - 5, 190, footerY - 5);
    
    pdf.setFontSize(8);
    pdf.setTextColor(102, 102, 102);
    pdf.setFont(undefined, "normal");
    pdf.text("Generated automatically by GAF Media Management System", 105, footerY, { align: "center" });

    // Save PDF
    const filename = `Daily-Activity-${data.userRole}-${format(data.date, "yyyy-MM-dd")}.pdf`;
    pdf.save(filename);

    return true;
  } catch (error) {
    console.error("Error generating daily activity PDF:", error);
    throw error;
  }
};