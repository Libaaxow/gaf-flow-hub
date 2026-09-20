import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { REPORT_NAVY, addReportFooters, drawReportHeader, drawReportSummary, reportStatus, reportTableStyles } from "@/utils/reportPdfStyle";

interface ActivityItem { time: string; action: string; details: string; status?: string }
interface DailyActivityData { userRole: string; userName: string; date: Date; activities: ActivityItem[]; stats: { label: string; value: string | number }[] }

export const generateDailyActivityPDF = (data: DailyActivityData) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = drawReportHeader(pdf, "DAILY ACTIVITY REPORT", `${data.userRole} — ${data.userName}  |  ${format(data.date, "dd MMMM yyyy")}`);
  if (data.stats.length) y = drawReportSummary(pdf, y, data.stats.map((stat) => ({ label: stat.label, value: String(stat.value), color: REPORT_NAVY })));
  autoTable(pdf, { startY: y, head: [["Time", "Action", "Full details", "Status"]], body: data.activities.length ? data.activities.map((activity) => [activity.time, activity.action, activity.details, reportStatus(activity.status || "N/A")]) : [["—", "No activity", "No activities were recorded for this day.", "N/A"]], ...reportTableStyles, columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 42 }, 2: { cellWidth: 78 }, 3: { cellWidth: 26 } } });
  addReportFooters(pdf, "Daily Activity Report");
  pdf.save(`Daily-Activity-${data.userRole}-${format(data.date, "yyyy-MM-dd")}.pdf`);
  return true;
};