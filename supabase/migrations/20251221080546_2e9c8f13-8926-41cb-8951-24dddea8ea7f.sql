-- Keep invoices in sync with payments (multi-payment + partial payment support)
CREATE OR REPLACE FUNCTION public.recompute_invoice_payment_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_paid numeric;
  v_total numeric;
  v_is_draft boolean;
  v_status text;
BEGIN
  SELECT total_amount, is_draft, status
    INTO v_total, v_is_draft, v_status
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount + COALESCE(discount_amount, 0)), 0)
    INTO v_paid
  FROM public.payments
  WHERE invoice_id = p_invoice_id;

  UPDATE public.invoices
  SET
    amount_paid = v_paid,
    status = CASE
      WHEN COALESCE(v_is_draft, false) THEN v_status
      WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 AND v_paid < v_total THEN 'partially_paid'
      ELSE v_status
    END,
    updated_at = now()
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_payments_recompute_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_invoice_payment_status(OLD.invoice_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
      PERFORM public.recompute_invoice_payment_status(OLD.invoice_id);
    END IF;
    PERFORM public.recompute_invoice_payment_status(NEW.invoice_id);
    RETURN NEW;
  ELSE
    PERFORM public.recompute_invoice_payment_status(NEW.invoice_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS payments_recompute_invoice ON public.payments;
CREATE TRIGGER payments_recompute_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.tg_payments_recompute_invoice();