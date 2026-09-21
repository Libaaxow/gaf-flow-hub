import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = Boolean(body?.dryRun);
    } catch {
      // no body — scheduled run
    }

    // Unpaid / partially paid confirmed invoices
    const { data: invoices, error } = await db
      .from("invoices")
      .select("id, invoice_number, total_amount, amount_paid, due_date, is_draft, customer_id, customers(id, name, phone)")
      .eq("is_draft", false)
      .in("status", ["unpaid", "partially_paid", "partial", "pending"]);

    if (error) throw error;

    // Group outstanding balance per customer
    const perCustomer = new Map<string, { name: string; phone: string; outstanding: number; invoices: number }>();
    for (const inv of invoices || []) {
      const customer: any = (inv as any).customers;
      const outstanding = Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);
      if (!customer?.phone || outstanding <= 0.01) continue;
      const entry = perCustomer.get(customer.id) ||
        { name: customer.name || "Customer", phone: customer.phone, outstanding: 0, invoices: 0 };
      entry.outstanding += outstanding;
      entry.invoices += 1;
      perCustomer.set(customer.id, entry);
    }

    const recipients = Array.from(perCustomer.entries()).map(([customerId, c]) => ({
      customerId,
      phone: c.phone,
      name: c.name,
      outstanding: c.outstanding,
      invoices: c.invoices,
    }));

    if (dryRun) {
      return new Response(
        JSON.stringify({ dryRun: true, customers: recipients.length, recipients }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let failed = 0;

    // Each reminder carries its own balance, so send them one by one (throttled).
    for (const r of recipients) {
      const message =
        `Hi ${r.name}, this is a friendly reminder from GAF MEDIA. ` +
        `Your outstanding balance is $${r.outstanding.toFixed(2)} across ${r.invoices} invoice(s). ` +
        `Please arrange payment. Mahadsanid.`;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms-twilio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internalKey: SERVICE_ROLE_KEY,
          message,
          messageType: "debt_reminder",
          recipients: [{ phone: r.phone, name: r.name, customerId: r.customerId }],
        }),
      });

      const text = await res.text();
      if (res.ok) {
        sent += 1;
      } else {
        failed += 1;
        console.error(`Reminder failed for ${r.name} [${res.status}]: ${text}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    return new Response(
      JSON.stringify({ success: true, customers: recipients.length, sent, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in monthly-debt-reminders:", error);
    return new Response(JSON.stringify({ error: error?.message || "Failed to send reminders" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
