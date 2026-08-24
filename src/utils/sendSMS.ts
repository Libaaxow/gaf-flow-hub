import { supabase } from "@/integrations/supabase/client";

interface SendSMSParams {
  to: string;
  message: string;
  senderId?: string;
}

export async function sendSMS({ to, message, senderId }: SendSMSParams) {
  try {
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: { to, message, senderId },
    });

    if (error) {
      const details = error instanceof Error ? error.message : String(error);
      console.error("Error sending SMS:", details);
      throw new Error(details);
    }

    return data;
  } catch (error: any) {
    console.error("Failed to send SMS:", error);
    throw error;
  }
}
