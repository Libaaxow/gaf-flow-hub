-- Add WhatsApp number to profiles
ALTER TABLE public.profiles
ADD COLUMN whatsapp_number text;

COMMENT ON COLUMN public.profiles.whatsapp_number IS 'WhatsApp number for notifications (format: +1234567890)';

-- Create notifications table to track sent notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  notification_type text NOT NULL,
  message text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = recipient_id);

-- System can insert notifications
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create index for performance
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX idx_notifications_order ON public.notifications(order_id);
CREATE INDEX idx_notifications_status ON public.notifications(status);