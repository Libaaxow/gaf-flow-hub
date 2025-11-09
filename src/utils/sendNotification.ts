import { supabase } from '@/integrations/supabase/client';

interface SendNotificationParams {
  recipientId: string;
  message: string;
  orderId: string;
}

export async function sendWhatsAppNotification({ recipientId, message, orderId }: SendNotificationParams) {
  try {
    // Get recipient's WhatsApp number
    const { data: profile } = await supabase
      .from('profiles')
      .select('whatsapp_number')
      .eq('id', recipientId)
      .single();

    if (!profile?.whatsapp_number) {
      console.warn('No WhatsApp number for recipient:', recipientId);
      return;
    }

    // Call the edge function to send WhatsApp message
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        to: profile.whatsapp_number,
        message,
        orderId,
      },
    });

    if (error) {
      console.error('Error sending WhatsApp notification:', error);
      throw error;
    }

    console.log('WhatsApp notification sent:', data);
    return data;
  } catch (error) {
    console.error('Failed to send WhatsApp notification:', error);
    throw error;
  }
}
