import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  recipientName: string;
  jobId: string;
  jobTitle: string;
  message: string;
  notificationType: 'designer_assigned' | 'print_operator_assigned' | 'status_change' | 'general';
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, recipientName, jobId, jobTitle, message, notificationType }: EmailRequest = await req.json();

    console.log(`Sending email notification to: ${to}`);
    console.log(`Notification type: ${notificationType}`);

    // Generate email subject based on notification type
    let subject = `New Job Assigned: ${jobId}`;
    if (notificationType === 'designer_assigned') {
      subject = `Design Job Assigned: ${jobId}`;
    } else if (notificationType === 'print_operator_assigned') {
      subject = `Print Job Assigned: ${jobId}`;
    } else if (notificationType === 'status_change') {
      subject = `Job Status Update: ${jobId}`;
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
            <h2>Hello ${recipientName || 'Team Member'},</h2>
            
            <div class="job-details">
              <p><strong>Job Reference:</strong> <span class="job-id">${jobId}</span></p>
              ${jobTitle ? `<p><strong>Job Title:</strong> ${jobTitle}</p>` : ''}
            </div>
            
            <div class="message">
              <p>${message}</p>
            </div>
            
            <p>Please log in to the system to view the complete job details and take necessary action.</p>
            
            <center>
              <a href="${Deno.env.get('SITE_URL') || 'https://gaf-media.lovable.app'}" class="cta-button">
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
      to: [to],
      subject: subject,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
