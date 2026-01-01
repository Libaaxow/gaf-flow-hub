import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { Resend } from "https://esm.sh/resend@2.0.0";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Processing pending email notifications...');

    // Fetch pending email notifications
    const { data: notifications, error: fetchError } = await supabase
      .from('notifications')
      .select(`
        id,
        order_id,
        recipient_id,
        message,
        notification_type,
        profiles!notifications_recipient_id_fkey (
          email,
          full_name,
          email_notifications_enabled
        ),
        orders!notifications_order_id_fkey (
          job_title
        )
      `)
      .eq('email_status', 'pending')
      .limit(10);

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError);
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      console.log('No pending email notifications to process');
      return new Response(
        JSON.stringify({ message: 'No pending email notifications' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${notifications.length} pending email notifications`);

    const results = await Promise.allSettled(
      notifications.map(async (notification: any) => {
        const profile = notification.profiles;
        const order = notification.orders;
        
        // Check if user has email notifications enabled
        if (!profile?.email_notifications_enabled) {
          console.log(`Email notifications disabled for user, notification ${notification.id}`);
          await supabase
            .from('notifications')
            .update({ 
              email_status: 'skipped',
              email_error: 'User has disabled email notifications'
            })
            .eq('id', notification.id);
          return { id: notification.id, status: 'skipped', reason: 'Notifications disabled' };
        }

        if (!profile?.email) {
          console.log(`No email for notification ${notification.id}`);
          await supabase
            .from('notifications')
            .update({ 
              email_status: 'failed',
              email_error: 'No email address'
            })
            .eq('id', notification.id);
          return { id: notification.id, status: 'failed', reason: 'No email address' };
        }

        try {
          // Determine notification type
          let notificationType = 'general';
          if (notification.message?.includes('design')) {
            notificationType = 'designer_assigned';
          } else if (notification.message?.includes('print')) {
            notificationType = 'print_operator_assigned';
          }

          // Generate email subject
          const jobId = notification.order_id?.slice(0, 8).toUpperCase() || 'N/A';
          let subject = `New Job Assigned: ${jobId}`;
          if (notificationType === 'designer_assigned') {
            subject = `Design Job Assigned: ${jobId}`;
          } else if (notificationType === 'print_operator_assigned') {
            subject = `Print Job Assigned: ${jobId}`;
          }

          // Generate email HTML content
          const emailHtml = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${subject}</title>
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                  }
                  .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    border-radius: 10px 10px 0 0;
                    text-align: center;
                  }
                  .content {
                    background: #f9fafb;
                    padding: 30px;
                    border: 1px solid #e5e7eb;
                  }
                  .job-details {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border-left: 4px solid #667eea;
                  }
                  .job-details p {
                    margin: 8px 0;
                  }
                  .job-id {
                    font-weight: bold;
                    color: #667eea;
                  }
                  .message {
                    background: #fff;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                  }
                  .cta-button {
                    display: inline-block;
                    background: #667eea;
                    color: white !important;
                    padding: 12px 30px;
                    border-radius: 6px;
                    text-decoration: none;
                    font-weight: 600;
                    margin: 20px 0;
                  }
                  .footer {
                    text-align: center;
                    padding: 20px;
                    color: #6b7280;
                    font-size: 14px;
                    border-top: 1px solid #e5e7eb;
                  }
                  .note {
                    font-size: 12px;
                    color: #9ca3af;
                    margin-top: 20px;
                  }
                </style>
              </head>
              <body>
                <div class="header">
                  <h1>GAF Media</h1>
                  <p>Job Notification</p>
                </div>
                <div class="content">
                  <h2>Hello ${profile.full_name || 'Team Member'},</h2>
                  
                  <div class="job-details">
                    <p><strong>Job Reference:</strong> <span class="job-id">${jobId}</span></p>
                    ${order?.job_title ? `<p><strong>Job Title:</strong> ${order.job_title}</p>` : ''}
                  </div>
                  
                  <div class="message">
                    <p>${notification.message}</p>
                  </div>
                  
                  <p>Please log in to the system to view the complete job details and take necessary action.</p>
                  
                  <center>
                    <a href="https://gaf-media.lovable.app" class="cta-button">
                      View Job Details
                    </a>
                  </center>
                  
                  <p class="note">
                    This is an automated notification. No reply is required.
                  </p>
                </div>
                <div class="footer">
                  <p>© ${new Date().getFullYear()} GAF Media. All rights reserved.</p>
                  <p>You received this email because you are assigned to this job.</p>
                </div>
              </body>
            </html>
          `;

          const emailResponse = await resend.emails.send({
            from: "GAF Media <notifications@resend.dev>",
            to: [profile.email],
            subject: subject,
            html: emailHtml,
          });

          console.log(`Email sent successfully for notification ${notification.id}:`, emailResponse);

          // Mark as sent
          await supabase
            .from('notifications')
            .update({ 
              email_status: 'sent',
              email_sent_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          return { id: notification.id, status: 'sent' };
        } catch (error: any) {
          console.error(`Failed to send email for notification ${notification.id}:`, error);
          
          // Mark as failed with error message
          await supabase
            .from('notifications')
            .update({ 
              email_status: 'failed',
              email_error: error.message || 'Unknown error'
            })
            .eq('id', notification.id);

          // Try to notify admin about the failure
          try {
            const { data: adminUsers } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('role', 'admin')
              .limit(1);

            if (adminUsers && adminUsers.length > 0) {
              await supabase
                .from('notifications')
                .insert({
                  order_id: notification.order_id,
                  recipient_id: adminUsers[0].user_id,
                  notification_type: 'system',
                  message: `Email notification failed for order ${notification.order_id?.slice(0, 8)}: ${error.message}`,
                  status: 'pending',
                  email_status: 'not_required'
                });
            }
          } catch (adminNotifyError) {
            console.error('Failed to notify admin about email failure:', adminNotifyError);
          }

          return { id: notification.id, status: 'failed', error: error.message };
        }
      })
    );

    const summary = {
      total: notifications.length,
      sent: results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 'sent').length,
      failed: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any).status === 'failed')).length,
      skipped: results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 'skipped').length,
    };

    console.log('Email processing summary:', summary);

    return new Response(
      JSON.stringify({ 
        message: 'Email notifications processed',
        summary,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', reason: r.reason })
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in process-email-notifications function:', error);
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
