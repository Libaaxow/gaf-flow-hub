ALTER TABLE public.shareholder_transactions
ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS shareholder_transactions_expense_id_unique
ON public.shareholder_transactions (expense_id)
WHERE expense_id IS NOT NULL;

UPDATE public.shareholder_transactions
SET expense_id = 'd4470aba-c6d5-4ffa-af1c-1d3a0bde4066'
WHERE id = 'ff4a256a-2fd9-4178-980b-3d3b6eaae105'
  AND expense_id IS NULL;

CREATE OR REPLACE FUNCTION public.sync_shareholder_debt_from_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shareholder_transactions
  SET amount = NEW.amount,
      transaction_date = NEW.expense_date,
      description = 'Expense: ' || NEW.description
  WHERE expense_id = NEW.id
    AND transaction_type = 'debt_taken';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_shareholder_debt_from_expense() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_shareholder_debt_from_expense() TO service_role;

DROP TRIGGER IF EXISTS sync_shareholder_debt_after_expense_edit ON public.expenses;
CREATE TRIGGER sync_shareholder_debt_after_expense_edit
AFTER UPDATE OF amount, expense_date, description ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.sync_shareholder_debt_from_expense();

UPDATE public.shareholder_transactions st
SET amount = e.amount,
    transaction_date = e.expense_date,
    description = 'Expense: ' || e.description
FROM public.expenses e
WHERE st.expense_id = e.id
  AND st.transaction_type = 'debt_taken';