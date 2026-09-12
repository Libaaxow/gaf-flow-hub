ALTER TABLE public.company_liabilities
ADD COLUMN IF NOT EXISTS vendor_bill_id uuid REFERENCES public.vendor_bills(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_liabilities_vendor_bill_id_key
ON public.company_liabilities (vendor_bill_id)
WHERE vendor_bill_id IS NOT NULL;

UPDATE public.company_liabilities cl
SET vendor_bill_id = vb.id
FROM public.vendor_bills vb
JOIN public.vendors v ON v.id = vb.vendor_id
WHERE cl.vendor_bill_id IS NULL
  AND lower(trim(COALESCE(cl.vendor_name, ''))) = lower(trim(v.name))
  AND cl.amount = vb.total_amount
  AND vb.notes = 'From liability: ' || cl.title;

CREATE OR REPLACE FUNCTION public.post_liability_payment_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment numeric;
  v_bill_paid numeric;
BEGIN
  v_payment := COALESCE(NEW.paid_amount, 0) - COALESCE(OLD.paid_amount, 0);

  IF NEW.vendor_bill_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_bill_paid
    FROM public.vendor_payments
    WHERE vendor_bill_id = NEW.vendor_bill_id;

    IF v_bill_paid = COALESCE(NEW.paid_amount, 0) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_payment > 0 THEN
    INSERT INTO public.expenses (
      expense_date, category, description, amount, payment_method,
      supplier_name, notes, recorded_by, approval_status
    ) VALUES (
      CURRENT_DATE, 'Liability Payment', 'Liability payment: ' || NEW.title,
      v_payment, 'cash'::public.payment_method, NEW.vendor_name,
      'Auto-recorded from Company Liabilities & Payables. Liability ID: ' || NEW.id::text,
      COALESCE(auth.uid(), NEW.created_by), 'approved'
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_vendor_bill_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_bill_id uuid;
  v_total_paid numeric(12,2);
  v_bill_total numeric(12,2);
  v_bill_status public.vendor_bill_status;
BEGIN
  v_bill_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.vendor_bill_id ELSE NEW.vendor_bill_id END;

  IF v_bill_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM public.vendor_payments
    WHERE vendor_bill_id = v_bill_id;

    SELECT total_amount
    INTO v_bill_total
    FROM public.vendor_bills
    WHERE id = v_bill_id;

    v_bill_status := CASE
      WHEN v_total_paid >= v_bill_total THEN 'paid'::public.vendor_bill_status
      WHEN v_total_paid > 0 THEN 'partially_paid'::public.vendor_bill_status
      ELSE 'unpaid'::public.vendor_bill_status
    END;

    UPDATE public.vendor_bills
    SET amount_paid = v_total_paid,
        status = v_bill_status,
        updated_at = now()
    WHERE id = v_bill_id;

    UPDATE public.company_liabilities
    SET paid_amount = LEAST(v_total_paid, amount),
        status = CASE
          WHEN v_total_paid >= amount THEN 'paid'
          WHEN v_total_paid > 0 THEN 'partially_paid'
          ELSE 'unpaid'
        END,
        updated_at = now()
    WHERE vendor_bill_id = v_bill_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_update_vendor_bill_on_payment ON public.vendor_payments;
CREATE TRIGGER trigger_update_vendor_bill_on_payment
AFTER INSERT OR UPDATE OR DELETE ON public.vendor_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_vendor_bill_on_payment();