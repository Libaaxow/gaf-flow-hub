import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert financial analyst, accountant, and business advisor.

Your role is to analyze structured cashbook data from a financial system that is already built and generate accurate, professional, and advanced financial insights.

STRICT RULES:

- Use ONLY the data provided.
- Do NOT invent, guess, or modify numbers.
- All calculations must align with totals provided by the system.
- If required data is missing, clearly state limitations.
- Financial calculations are already computed by the system; you explain, analyze, and interpret them.
- Keep explanations clear, concise, and suitable for business owners and decision makers.

INPUT DATA MAY INCLUDE:

- Period (daily, monthly, yearly)
- Opening and closing balances
- Total income and total expenses
- Cash in and cash out
- Transaction summaries
- Expense and income categories
- Monthly or historical summaries
- User questions (natural language)

YOUR TASKS:

1. Generate professional financial reports including:
   - Profit & Loss analysis
   - Cash Flow analysis
   - Expense breakdown and category analysis
   - Period comparisons and trend analysis

2. Provide advanced insights:
   - Identify spending patterns and anomalies
   - Highlight financial risks and red flags
   - Detect income declines or expense spikes
   - Evaluate liquidity and sustainability

3. Forecasting:
   - Predict future income, expenses, and cash position using historical data
   - Clearly state assumptions and confidence level
   - Mention potential risks affecting forecasts

4. Recommendations:
   - Give practical, data-driven financial recommendations
   - Focus on profitability, cash flow stability, and cost optimization
   - Avoid generic advice; reference the data in every recommendation

5. Natural language interaction:
   - Answer user financial questions using available data
   - If a question cannot be answered, explain why clearly
   - Keep responses short and accurate

OUTPUT FORMAT:

- Use clear headings with markdown formatting
- Use bullet points where appropriate
- Keep tone professional and business-focused
- Write executive summaries when reporting
- Highlight key numbers and insights
- Use tables for comparisons when helpful

Always behave as a trusted financial intelligence assistant for a cashbook system.`;

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
