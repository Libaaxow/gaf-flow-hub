import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENT_DM_API_KEY = Deno.env.get("SENT_DM_API_KEY");
const SENT_DM_TEMPLATE_ID = Deno.env.get("SENT_DM_TEMPLATE_ID");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

interface SMSRequest {
  to: string;
  message: string;
  // Optional template overrides (Sent.dm templates)
  templateId?: string;
  templateParameters?: Record<string, string>;
}

// Sent.dm expects E.164 numbers. Somali numbers default to +252.
const normalizePhone = (phone: string): string => {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("252")) return "+" + digits;
  if (digits.startsWith("0")) return "+252" + digits.slice(1);
  if (digits.length === 9) return "+252" + digits;
  return "+" + digits;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SENT_DM_API_KEY) {
      return new Response(JSON.stringify({ error: "Sent.dm API key is not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, message, templateId, templateParameters }: SMSRequest = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipient = normalizePhone(to);
    if (recipient.replace(/\D/g, "").length < 9) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Record<string, unknown> = {
      to: [recipient],
      channel: ["sms"],
      sandbox: false,
    };

    const useTemplateId = templateId || SENT_DM_TEMPLATE_ID;
    if (useTemplateId) {
      body.template = {
        id: useTemplateId,
        parameters: templateParameters ?? { message },
      };
    } else {
      body.text = message;
    }

    const response = await fetch("https://api.sent.dm/v3/messages", {
      method: "POST",
      headers: {
        "x-api-key": SENT_DM_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok || responseData?.success === false) {
      console.error("Sent.dm error:", response.status, responseText);
      return new Response(
        JSON.stringify({ error: "SMS provider error", status: response.status, details: responseData }),
        { status: response.status >= 400 ? response.status : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider: "sent.dm",
        messageId: responseData?.data?.recipients?.[0]?.message_id ?? null,
        status: responseData?.data?.status ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in send-sms-sent function:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to send SMS" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
