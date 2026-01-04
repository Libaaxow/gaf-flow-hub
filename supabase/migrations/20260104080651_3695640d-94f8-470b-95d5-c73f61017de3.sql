-- Create/replace trigger so commissions are actually generated when an order is marked completed
-- (Function public.calculate_commission() already exists)

DROP TRIGGER IF EXISTS trg_calculate_commission_on_orders ON public.orders;

CREATE TRIGGER trg_calculate_commission_on_orders
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.calculate_commission();
