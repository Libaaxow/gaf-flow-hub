import { supabase } from "@/integrations/supabase/client";

export interface SMSRecipient {
  phone: string;
  name?: string;
  customerId?: string | null;
  invoiceId?: string | null;
}

interface SendSMSParams {
  to?: string;
  message: string;
  senderId?: string;
  /** "twilio" = Twilio Messaging Service (GAF MEDIA sender, default), "sent" = Sent.dm, "hormuud" = Hormuud SMS */
  provider?: "twilio" | "sent" | "hormuud";
  templateId?: string;
  templateParameters?: Record<string, string>;
  /** Bulk sending (Twilio only) */
  recipients?: SMSRecipient[];
  campaignId?: string | null;
  messageType?: string;
  customerId?: string | null;
  invoiceId?: string | null;
}

export interface SMSResult {
  success?: boolean;
  provider?: string;
  senderId?: string;
  totalRecipients?: number;
  sent?: number;
  failed?: number;
  estimatedCost?: number;
  results?: { phone: string; ok: boolean; sid: string | null; error: string | null }[];
  [key: string]: any;
}

export async function sendSMS({
  to,
  message,
  senderId,
  provider = "twilio",
  templateId,
  templateParameters,
  recipients,
  campaignId = null,
  messageType = "transactional",
  customerId = null,
  invoiceId = null,
}: SendSMSParams): Promise<SMSResult> {
  const fnName =
    provider === "hormuud" ? "send-sms" : provider === "sent" ? "send-sms-sent" : "send-sms-twilio";

  const body =
    provider === "hormuud"
      ? { to, message, senderId }
      : provider === "sent"
      ? { to, message, templateId, templateParameters }
      : {
          message,
          campaignId,
          messageType,
          recipients:
            recipients && recipients.length > 0
              ? recipients
              : to
              ? [{ phone: to, customerId, invoiceId }]
              : [],
        };

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

    return (data || {}) as SMSResult;
  } catch (error: any) {
    console.error("Failed to send SMS:", error);
    throw error;
  }
}
