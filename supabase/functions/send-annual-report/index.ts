import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const money = (n: number) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RESERVE_PERCENTAGE = 0.3;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const testEmail: string | undefined = body.testEmail;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---------- Gather every financial record ----------
    const [
      invoicesRes, paymentsRes, expensesRes, balancesRes, assetsRes,
      billsRes, liabilitiesRes, shRes, txRes, fyRes,
    ] = await Promise.all([
      supabase.from("invoices").select("invoice_number, invoice_date, due_date, total_amount, amount_paid, status, customers(name)").eq("is_draft", false),
      supabase.from("payments").select("amount, payment_date, payment_method"),
      supabase.from("expenses").select("category, amount, expense_date").eq("approval_status", "approved"),
      supabase.from("beginning_balances").select("amount"),
      supabase.from("company_assets").select("asset_name, quantity, unit_price, total_value, status"),
      supabase.from("vendor_bills").select("total_amount, amount_paid"),
      supabase.from("company_liabilities").select("title, vendor_name, amount, paid_amount, due_date, status"),
      supabase.from("shareholders").select("id, full_name, share_percentage").eq("status", "active"),
      supabase.from("shareholder_transactions").select("shareholder_id, transaction_type, amount"),
      supabase.from("fiscal_years").select("*").order("end_date", { ascending: false }),
    ]);

    const invoices = invoicesRes.data || [];
    const payments = paymentsRes.data || [];
    const expenses = expensesRes.data || [];
    const assets = assetsRes.data || [];
    const liabilities = liabilitiesRes.data || [];
    const shareholders = shRes.data || [];
    const txs = txRes.data || [];
    const years = fyRes.data || [];

    const openingBalance = (balancesRes.data || []).reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
    const collected = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const expensesTotal = expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const cashBalance = openingBalance + collected - expensesTotal;
    const totalInvoiced = invoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
    const receivables = invoices.reduce((s: number, i: any) => s + Math.max(0, Number(i.total_amount || 0) - Number(i.amount_paid || 0)), 0);
    const fixedAssets = assets.reduce((s: number, a: any) => s + Number(a.total_value || 0), 0);
    const vendorBillsDue = (billsRes.data || []).reduce((s: number, b: any) => s + Math.max(0, Number(b.total_amount || 0) - Number(b.amount_paid || 0)), 0);
    const payablesDue = liabilities.reduce((s: number, l: any) => s + Math.max(0, Number(l.amount || 0) - Number(l.paid_amount || 0)), 0);
    const totalLiabilities = payablesDue + vendorBillsDue;

    const sumTx = (id: string, type: string) =>
      txs.filter((t: any) => t.shareholder_id === id && t.transaction_type === type)
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

    const holders = shareholders.map((sh: any) => ({
      full_name: sh.full_name,
      pct: Number(sh.share_percentage || 0),
      capital: sumTx(sh.id, "capital_investment"),
      withdrawals: sumTx(sh.id, "withdrawal"),
      loan: Math.max(0, sumTx(sh.id, "debt_taken") - sumTx(sh.id, "debt_repayment")),
    }));
    const shareholderLoans = holders.reduce((s, h) => s + h.loan, 0);
    const totalAssets = cashBalance + receivables + fixedAssets + shareholderLoans;
    const netWorth = totalAssets - totalLiabilities;
    const cashAfterPayables = Math.max(0, cashBalance - totalLiabilities);
    const reserve = cashAfterPayables * RESERVE_PERCENTAGE;
    const distributable = cashAfterPayables - reserve;

    const openYear = years.find((y: any) => y.status === "open");
    const periodLabel = openYear
      ? `${openYear.year_label} (${openYear.start_date} → ${openYear.end_date})`
      : `All records as of ${new Date().toISOString().slice(0, 10)}`;

    // ---------- Recipients ----------
    let recipients: string[] = [];
    if (testEmail) {
      recipients = [testEmail];
    } else {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin", "board"]);
      const ids = (roles || []).map((r: any) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("email").in("id", ids);
        recipients = (profs || []).map((p: any) => p.email).filter(Boolean);
      }
    }
    if (!recipients.length) {
      return new Response(JSON.stringify({ success: false, error: "No recipients found" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ---------- Build the report HTML ----------
    const row = (label: string, value: string, bold = false) =>
      `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee;${bold ? "font-weight:700;" : ""}">${label}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;${bold ? "font-weight:700;" : ""}">${value}</td></tr>`;

    const card = (label: string, value: string, color: string) =>
      `<td style="padding:6px;"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
        <div style="font-size:16px;font-weight:700;color:${color};margin-top:4px;">${value}</div></div></td>`;

    const section = (n: string, title: string) =>
      `<div style="background:#393D8C;color:#fff;padding:9px 12px;border-radius:6px;font-weight:700;font-size:13px;margin:26px 0 10px;">${n}. ${title}</div>`;

    const byMethod = new Map<string, number>();
    payments.forEach((p: any) => {
      const k = (p.payment_method || "other").replace(/_/g, " ").toUpperCase();
      byMethod.set(k, (byMethod.get(k) || 0) + Number(p.amount || 0));
    });
    const byCategory = new Map<string, number>();
    expenses.forEach((e: any) => {
      const k = e.category || "Uncategorized";
      byCategory.set(k, (byCategory.get(k) || 0) + Number(e.amount || 0));
    });
    const perCustomer = new Map<string, number>();
    invoices.forEach((i: any) => {
      const due = Math.max(0, Number(i.total_amount || 0) - Number(i.amount_paid || 0));
      if (due > 0.009) {
        const name = i.customers?.name || "Unknown";
        perCustomer.set(name, (perCustomer.get(name) || 0) + due);
      }
    });

    const listTable = (head: string[], rows: string[][], footer?: string[]) => `
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;margin-top:6px;">
        <thead><tr>${head.map((h, i) => `<th style="background:#393D8C;color:#fff;padding:7px 10px;text-align:${i === 0 ? "left" : "right"};font-size:11px;">${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:${i === 0 ? "left" : "right"};">${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" style="padding:10px;color:#777;">No records</td></tr>`}</tbody>
        ${footer ? `<tfoot><tr>${footer.map((c, i) => `<td style="padding:8px 10px;background:#f1f5f9;font-weight:700;text-align:${i === 0 ? "left" : "right"};">${c}</td>`).join("")}</tr></tfoot>` : ""}
      </table>`;

    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<div style="max-width:760px;margin:0 auto;background:#ffffff;">
  <div style="background:#DA2227;color:#fff;padding:26px 28px;">
    <div style="font-size:22px;font-weight:800;letter-spacing:1px;">GAF MEDIA</div>
    <div style="font-size:13px;opacity:.9;margin-top:2px;">Annual Company Closing Report</div>
    <div style="font-size:12px;opacity:.85;margin-top:8px;">${periodLabel}</div>
  </div>
  <div style="padding:24px 28px;">
    <p style="font-size:13px;line-height:1.6;color:#334155;">
      This is the automatic company report for the shareholder year cycle (21 December → 20 December).
      It explains, from top to bottom, what the company owns, what it owes, what it earned and what each
      shareholder is entitled to. The same report is attached as a printable file.
    </p>

    ${section("1", "EXECUTIVE SUMMARY — WHAT THE COMPANY IS WORTH")}
    <table width="100%" cellspacing="0" cellpadding="0"><tr>
      ${card("Cash Balance", money(cashBalance), "#16a34a")}
      ${card("Receivables", money(receivables), "#ea580c")}
      ${card("Fixed Assets", money(fixedAssets), "#2563eb")}
    </tr><tr>
      ${card("Liabilities", money(totalLiabilities), "#dc2626")}
      ${card("Net Company Worth", money(netWorth), netWorth >= 0 ? "#16a34a" : "#dc2626")}
      ${card("Distributable Cash", money(distributable), "#393D8C")}
    </tr></table>

    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;margin-top:14px;border:1px solid #eee;">
      ${row("Opening balance recorded in the system", money(openingBalance))}
      ${row("+ Payments actually collected from customers", money(collected))}
      ${row("− Approved expenses paid out", `(${money(expensesTotal)})`)}
      ${row("= Cash balance on hand", money(cashBalance), true)}
      ${row("+ Money still owed by customers", money(receivables))}
      ${row("+ Value of company fixed assets", money(fixedAssets))}
      ${row("+ Loans owed by shareholders to the company", money(shareholderLoans))}
      ${row("− Company liabilities and vendor bills", `(${money(totalLiabilities)})`)}
      ${row("= NET COMPANY WORTH", money(netWorth), true)}
    </table>

    ${section("2", "INCOME, COLLECTIONS & EXPENSES")}
    ${listTable(["Collections by payment method", "Amount", "% of collected"],
      Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, money(v), collected > 0 ? `${((v / collected) * 100).toFixed(1)}%` : "0%"]),
      ["TOTAL COLLECTED", money(collected), "100%"])}
    <div style="height:14px"></div>
    ${listTable(["Expenses by category", "Amount", "% of expenses"],
      Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, money(v), expensesTotal > 0 ? `${((v / expensesTotal) * 100).toFixed(1)}%` : "0%"]),
      ["TOTAL EXPENSES", money(expensesTotal), "100%"])}
    <p style="font-size:12px;color:#475569;margin-top:10px;">
      Total invoiced to customers: <b>${money(totalInvoiced)}</b> · Collected: <b>${money(collected)}</b> ·
      Still to collect: <b>${money(receivables)}</b>
    </p>

    ${section("3", "MONEY OWED TO THE COMPANY (RECEIVABLES)")}
    ${listTable(["Customer", "Outstanding"],
      Array.from(perCustomer.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v)]),
      ["TOTAL OUTSTANDING", money(receivables)])}

    ${section("4", "COMPANY FIXED ASSETS")}
    ${listTable(["Asset", "Qty", "Unit price", "Total value", "Condition"],
      assets.map((a: any) => [a.asset_name, String(a.quantity), money(a.unit_price), money(a.total_value), String(a.status || "").replace(/_/g, " ").toUpperCase()]),
      ["TOTAL ASSETS", "", "", money(fixedAssets), ""])}

    ${section("5", "LIABILITIES & PAYABLES")}
    ${listTable(["Liability", "Vendor", "Amount", "Paid", "Remaining"],
      liabilities.map((l: any) => [l.title, l.vendor_name || "-", money(l.amount), money(l.paid_amount), money(Math.max(0, Number(l.amount || 0) - Number(l.paid_amount || 0)))]),
      ["TOTAL PAYABLES", "", "", "", money(payablesDue)])}
    <p style="font-size:12px;color:#475569;margin-top:8px;">Unpaid vendor bills: <b>${money(vendorBillsDue)}</b></p>

    ${section("6", "SHAREHOLDER SETTLEMENT")}
    <p style="font-size:12px;color:#475569;">
      Cash after settling all debts: <b>${money(cashAfterPayables)}</b> · Company reserve kept
      (${(RESERVE_PERCENTAGE * 100).toFixed(0)}%): <b>${money(reserve)}</b> · Cash available for shareholders:
      <b>${money(distributable)}</b>. The reserve is capitalised into company assets at closing.
    </p>
    ${listTable(["Shareholder", "Share %", "Capital in", "Net worth share", "Loan", "Net cash payout"],
      holders.map(h => {
        const p = h.pct / 100;
        const gross = distributable * p;
        return [h.full_name, `${h.pct}%`, money(h.capital), money(netWorth * p), money(h.loan), money(Math.max(0, gross - h.loan))];
      }))}

    ${section("7", "YEAR CYCLE STATUS")}
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;border:1px solid #eee;">
      ${row("Current open cycle", openYear ? openYear.year_label : "—")}
      ${row("Cycle period", openYear ? `${openYear.start_date} → ${openYear.end_date}` : "—")}
      ${row("Closing rule", "Closes automatically on 20 December, reopens 21 December")}
    </table>

    <p style="font-size:11px;color:#94a3b8;margin-top:26px;line-height:1.6;">
      This report is generated automatically from the live accounting records of GAF Media.
      Figures reflect all finalised invoices, recorded payments, approved expenses, registered assets
      and liabilities at the time of generation.
    </p>
  </div>
  <div style="background:#f1f5f9;padding:16px 28px;font-size:11px;color:#64748b;text-align:center;">
    © ${new Date().getFullYear()} GAF Media · Shanemo Shatrale, Baidoa, Somalia · gafmedia02@gmail.com
  </div>
</div></body></html>`;

    const subject = `GAF Media — Annual Closing Report ${openYear ? openYear.year_label : new Date().getFullYear()}`;

    const sendRes = await resend.emails.send({
      from: "GAF Media <onboarding@resend.dev>",
      to: recipients,
      subject,
      html,
      attachments: [
        {
          filename: `gaf-media-annual-report-${openYear ? openYear.year_label.replace(/\s/g, "-") : new Date().getFullYear()}.html`,
          content: btoa(unescape(encodeURIComponent(html))),
        },
      ],
    });

    console.log("Annual report sent", JSON.stringify(sendRes));

    return new Response(JSON.stringify({ success: true, recipients, result: sendRes }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("send-annual-report error", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
