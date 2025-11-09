import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key for admin access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Processing pending notifications...');

    // Fetch pending notifications
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select(`
        id,
        order_id,
        recipient_id,
        message,
        profiles!notifications_recipient_id_fkey (
          whatsapp_number,
          full_name
        )
      `)
      .eq('status', 'pending')
      .limit(10);

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError);
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      console.log('No pending notifications to process');
      return new Response(
        JSON.stringify({ message: 'No pending notifications' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${notifications.length} pending notifications`);

    // Process each notification
    const results = await Promise.allSettled(
      notifications.map(async (notification: any) => {
        const profile = notification.profiles;
        
        if (!profile?.whatsapp_number) {
          console.log(`No WhatsApp number for notification ${notification.id}`);
          // Mark as failed
          await supabase
            .from('notifications')
            .update({ status: 'failed' })
            .eq('id', notification.id);
          return { id: notification.id, status: 'failed', reason: 'No WhatsApp number' };
        }

        try {
          // Call send-whatsapp function
          const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
              to: profile.whatsapp_number,
              message: notification.message,
              orderId: notification.order_id,
            },
          });

          if (error) {
            console.error(`Error sending WhatsApp for notification ${notification.id}:`, error);
            throw error;
          }

          console.log(`WhatsApp sent successfully for notification ${notification.id}`);

          // Mark as sent
          await supabase
            .from('notifications')
            .update({ 
              status: 'sent',
              sent_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          return { id: notification.id, status: 'sent' };
        } catch (error) {
          console.error(`Failed to send notification ${notification.id}:`, error);
          
          // Mark as failed
          await supabase
            .from('notifications')
            .update({ status: 'failed' })
            .eq('id', notification.id);

          return { id: notification.id, status: 'failed', error };
        }
      })
    );

    const summary = {
      total: notifications.length,
      sent: results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 'sent').length,
      failed: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any).status === 'failed')).length,
    };

    console.log('Processing summary:', summary);

    return new Response(
      JSON.stringify({ 
        message: 'Notifications processed',
        summary,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', reason: r.reason })
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in process-notifications function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
