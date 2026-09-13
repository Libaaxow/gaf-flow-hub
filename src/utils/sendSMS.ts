import { supabase } from "@/integrations/supabase/client";

interface SendSMSParams {
  to: string;
  message: string;
  senderId?: string;
  /** "sent" = Sent.dm (default), "hormuud" = Hormuud SMS */
  provider?: "sent" | "hormuud";
  templateId?: string;
  templateParameters?: Record<string, string>;
}

export async function sendSMS({
  to,
  message,
  senderId,
  provider = "sent",
  templateId,
  templateParameters,
}: SendSMSParams) {
  const fnName = provider === "hormuud" ? "send-sms" : "send-sms-sent";
  const body =
    provider === "hormuud"
      ? { to, message, senderId }
      : { to, message, templateId, templateParameters };

  try {
    const { data, error } = await supabase.functions.invoke(fnName, { body });

    if (error) {
      const details =
        error && typeof (error as any).context?.text === "function"
          ? await (error as any).context.text()
          : error instanceof Error
          ? error.message
          : String(error);
      console.error("Error sending SMS:", details);
      throw new Error(details);
    }

    return data;
  } catch (error: any) {
    console.error("Failed to send SMS:", error);
    throw error;
  }
}
