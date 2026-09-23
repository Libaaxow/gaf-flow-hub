import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const MESSAGING_SERVICE_SID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const normalizePhone = (phone: string): string => {
  const trimmed = (phone || "").trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("252")) return "+" + digits;
  if (digits.startsWith("0")) return "+252" + digits.slice(1);
  if (digits.length === 9) return "+252" + digits;
  return "+" + digits;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ACCOUNT_SID || !AUTH_TOKEN || !MESSAGING_SERVICE_SID) {
      return new Response(JSON.stringify({ error: "Twilio not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invoiceIds } = await req.json();
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return new Response(JSON.stringify({ error: "invoiceIds is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: invoices, error } = await db
      .from("invoices")
      .select("id, invoice_number, total_amount, amount_paid, due_date, customer_id, customers(name, phone)")
      .in("id", invoiceIds);
    if (error) throw error;

    const results: any[] = [];
    for (const inv of invoices || []) {
      const cust: any = (inv as any).customers;
      const to = normalizePhone(cust?.phone || "");
      const totalAmt = Number(inv.total_amount) || 0;
      const remainingBal = Math.max(0, totalAmt - (Number((inv as any).amount_paid) || 0));
      const body = `GAF MEDIA, $${totalAmt.toFixed(2)} ayaa lagugu dallacay oo ah sales Invoice ka ${inv.invoice_number}. Haraaga lacagta kugu harsan waa $${remainingBal.toFixed(2)}. Branch: Baidoa`;

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, Body: body, MessagingServiceSid: MESSAGING_SERVICE_SID }),
        },
      );
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) console.error(`Twilio error [${res.status}]: ${text}`);

      await db.from("sms_messages").insert({
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        phone: to,
        message: body,
        message_type: "invoice",
        status: res.ok ? "sent" : "failed",
        provider_sid: data?.sid ?? null,
        error_message: res.ok ? null : String(data?.message || text).slice(0, 500),
        segments: 1,
        cost: 0,
      });

      results.push({ invoice: inv.invoice_number, to, ok: res.ok, sid: data?.sid ?? null, error: res.ok ? null : data?.message || text });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("resend-invoice-sms failed:", e);
    return new Response(JSON.stringify({ error: e?.message || "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
