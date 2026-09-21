import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const MESSAGING_SERVICE_SID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
const COST_PER_SEGMENT = Number(Deno.env.get("TWILIO_SMS_COST_PER_SEGMENT") || "0.05");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface Recipient {
  phone: string;
  name?: string;
  customerId?: string | null;
  invoiceId?: string | null;
}

interface SMSRequest {
  // single send
  to?: string;
  message: string;
  // bulk send
  recipients?: Recipient[];
  campaignId?: string | null;
  messageType?: string;
  // internal/cron use
  internalKey?: string;
}

/** Somali numbers default to +252, Twilio needs E.164 */
const normalizePhone = (phone: string): string => {
  const trimmed = (phone || "").trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("252")) return "+" + digits;
  if (digits.startsWith("0")) return "+252" + digits.slice(1);
  if (digits.length === 9) return "+252" + digits;
  return "+" + digits;
};

const isValid = (e164: string) => e164.replace(/\D/g, "").length >= 9;

const segmentsFor = (text: string) => {
  const unicode = /[^\x00-\x7F]/.test(text);
  const size = unicode ? 70 : 160;
  return Math.max(1, Math.ceil(text.length / size));
};

const personalize = (template: string, name?: string) =>
  template
    .replace(/\{customer_name\}/gi, name || "Customer")
    .replace(/\{name\}/gi, name || "Customer");

async function sendOne(to: string, body: string) {
  const creds = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);
  const params = new URLSearchParams({
    To: to,
    Body: body,
    MessagingServiceSid: MESSAGING_SERVICE_SID!,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error(`Twilio error [${res.status}]: ${text}`);
    return { ok: false, status: res.status, error: data?.message || text, sid: null };
  }
  return { ok: true, status: res.status, sid: data?.sid ?? null, twilioStatus: data?.status ?? null };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ACCOUNT_SID || !AUTH_TOKEN || !MESSAGING_SERVICE_SID) {
      return new Response(
        JSON.stringify({ error: "Twilio is not fully configured (account SID, auth token, messaging service SID)" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload: SMSRequest = await req.json();
    const internal = payload.internalKey && payload.internalKey === SERVICE_ROLE_KEY;

    let userId: string | null = null;
    if (!internal) {
      const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      if (!jwt) {
        return new Response(JSON.stringify({ error: "Missing authorization token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data: { user }, error } = await authClient.auth.getUser(jwt);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    const { message, campaignId = null, messageType = "transactional" } = payload;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (message.length > 1600) {
      return new Response(JSON.stringify({ error: "message is too long (max 1600 characters)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const list: Recipient[] = payload.recipients && Array.isArray(payload.recipients)
      ? payload.recipients
      : payload.to
      ? [{ phone: payload.to }]
      : [];

    if (list.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (list.length > 2000) {
      return new Response(JSON.stringify({ error: "Too many recipients in one request (max 2000)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
      : null;

    const CHUNK = 10;
    const results: any[] = [];
    const logRows: any[] = [];
    let sent = 0;
    let failed = 0;
    let cost = 0;

    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      const outcomes = await Promise.all(chunk.map(async (r) => {
        const to = normalizePhone(r.phone || "");
        const body = personalize(message, r.name);
        if (!isValid(to)) {
          return { r, to, body, res: { ok: false, error: "Invalid phone number", sid: null, status: 400 } };
        }
        const res = await sendOne(to, body);
        return { r, to, body, res };
      }));

      for (const o of outcomes) {
        const seg = segmentsFor(o.body);
        const lineCost = o.res.ok ? seg * COST_PER_SEGMENT : 0;
        if (o.res.ok) {
          sent += 1;
          cost += lineCost;
        } else {
          failed += 1;
        }
        results.push({ phone: o.to, ok: o.res.ok, sid: o.res.sid ?? null, error: o.res.ok ? null : o.res.error });
        logRows.push({
          campaign_id: campaignId,
          customer_id: o.r.customerId ?? null,
          invoice_id: o.r.invoiceId ?? null,
          phone: o.to,
          message: o.body,
          message_type: messageType,
          status: o.res.ok ? "sent" : "failed",
          provider_sid: o.res.sid ?? null,
          error_message: o.res.ok ? null : String(o.res.error).slice(0, 500),
          segments: seg,
          cost: lineCost,
          sent_by: userId,
        });
      }

      // throttle between chunks to stay inside Twilio rate limits
      if (i + CHUNK < list.length) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    if (db && logRows.length > 0) {
      const { error: logError } = await db.from("sms_messages").insert(logRows);
      if (logError) console.error("Failed to log SMS messages:", logError.message);

      if (campaignId) {
        const { error: campErr } = await db
          .from("sms_campaigns")
          .update({
            total_recipients: list.length,
            total_sent: sent,
            total_failed: failed,
            total_delivered: sent,
            estimated_cost: Number(cost.toFixed(4)),
            status: failed === list.length ? "failed" : "sent",
          })
          .eq("id", campaignId);
        if (campErr) console.error("Failed to update campaign:", campErr.message);
      }
    }

    const allFailed = sent === 0 && failed > 0;
    return new Response(
      JSON.stringify({
        success: !allFailed,
        provider: "twilio",
        senderId: "GAF MEDIA",
        totalRecipients: list.length,
        sent,
        failed,
        estimatedCost: Number(cost.toFixed(4)),
        results,
      }),
      { status: allFailed ? 502 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in send-sms-twilio function:", error);
    return new Response(JSON.stringify({ error: error?.message || "Failed to send SMS" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
