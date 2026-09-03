CREATE OR REPLACE FUNCTION public.post_liability_payment_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment numeric;
BEGIN
  v_payment := COALESCE(NEW.paid_amount, 0) - COALESCE(OLD.paid_amount, 0);

  IF v_payment > 0 THEN
    INSERT INTO public.expenses (
      expense_date,
      category,
      description,
      amount,
      payment_method,
      supplier_name,
      notes,
      recorded_by,
      approval_status
    ) VALUES (
      CURRENT_DATE,
      'Liability Payment',
      'Liability payment: ' || NEW.title,
      v_payment,
      'cash'::public.payment_method,
      NEW.vendor_name,
      'Auto-recorded from Company Liabilities & Payables. Liability ID: ' || NEW.id::text,
      COALESCE(auth.uid(), NEW.created_by),
      'approved'
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS post_liability_payment_expense ON public.company_liabilities;
CREATE TRIGGER post_liability_payment_expense
AFTER UPDATE OF paid_amount ON public.company_liabilities
FOR EACH ROW
WHEN (NEW.paid_amount > OLD.paid_amount)
EXECUTE FUNCTION public.post_liability_payment_expense();

INSERT INTO public.expenses (
  expense_date,
  category,
  description,
  amount,
  payment_method,
  supplier_name,
  notes,
  recorded_by,
  approval_status
)
SELECT
  COALESCE(cl.updated_at::date, CURRENT_DATE),
  'Liability Payment',
  'Liability payment: ' || cl.title,
  cl.paid_amount,
  'cash'::public.payment_method,
  cl.vendor_name,
  'Backfilled from Company Liabilities & Payables. Liability ID: ' || cl.id::text,
  cl.created_by,
  'approved'
FROM public.company_liabilities cl
WHERE cl.paid_amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.category = 'Liability Payment'
      AND e.notes LIKE '%' || cl.id::text || '%'
  );