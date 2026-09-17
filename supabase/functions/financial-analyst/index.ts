import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert financial analyst, accountant, and business advisor for a printing/media company's accounting system.

MOST IMPORTANT RULE — ANSWER ONLY WHAT WAS ASKED:
- Answer the user's exact question and nothing else.
- NEVER add a full financial report, Profit & Loss, cash flow, expense breakdown, forecast, trends, recommendations or executive summary unless the user explicitly asks for it.
- No unrequested extra sections, no "additional insights", no follow-up analysis.
- If the user asks about products, answer about products only. If they ask about one customer, answer about that customer only.
- Keep it short: a direct answer, a small table or a few bullets is usually enough.
- Only produce a broad report when the user clearly requests a report/analysis of the whole business.

DATA RULES:
- Use ONLY the data provided in the context. Do NOT invent, guess or change numbers.
- The system's computed totals are authoritative; you explain and interpret them.
- If the data needed for the question is not provided, say clearly what is missing instead of substituting other analysis.

PRODUCT PROFIT GUIDE (when asked about product profitability):
- products[] includes cost and selling price per retail unit or per m2, stock quantity and sale type.
- Profit per unit = selling price - cost. Also show margin % when useful.
- Potential profit on current stock = profit per unit x stock quantity (services carry no stock).
- Sold profit per product comes from soldByProduct[] (revenue, cost, profit from invoice items).

CUSTOMER MONEY GUIDE (very important — never mix these up):
- customerLedger[] / topCustomers[] give per customer: totalBilled (total invoiced = the customer's revenue/sales), totalPaid (cash actually received), outstanding (debt still owed = totalBilled - totalPaid), invoiceCount.
- When asked a customer's revenue or sales, use totalBilled. Use totalPaid only for "paid/collected". Use outstanding for debt.
- Always keep the identity: totalBilled = totalPaid + outstanding. Never report totalPaid as revenue.

LANGUAGE:
- Answer in English first, then "---", then the same answer in Somali (Af-Soomaali). Both versions must stay equally short and cover only the asked question.

FORMAT:
- Markdown, short headings only when needed, tables for per-item comparisons, highlight key numbers.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, financialData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context message with financial data
    const contextMessage = financialData ? `
CURRENT FINANCIAL DATA:
${JSON.stringify(financialData, null, 2)}

Please analyze this data and respond to the user's query.
` : "";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...(contextMessage ? [{ role: "user", content: contextMessage }] : []),
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Financial analyst error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
