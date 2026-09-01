CREATE OR REPLACE FUNCTION public.auto_manage_fiscal_year()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open RECORD;
  v_today date := CURRENT_DATE;
  v_end_year int;
  v_start date;
  v_end date;
  v_label text;
  v_opening numeric := 0;
  v_collected numeric := 0;
  v_expenses numeric := 0;
  v_cash numeric := 0;
  v_receivables numeric := 0;
  v_fixed numeric := 0;
  v_bills numeric := 0;
  v_payables numeric := 0;
  v_liabilities numeric := 0;
  v_networth numeric := 0;
  v_cash_after numeric := 0;
  v_reserve numeric := 0;
  v_distributable numeric := 0;
  v_asset_id uuid;
BEGIN
  -- Close any open cycle whose end date has passed
  FOR v_open IN SELECT * FROM public.fiscal_years WHERE status = 'open' AND end_date < v_today LOOP
    SELECT COALESCE(SUM(amount),0) INTO v_opening FROM public.beginning_balances;
    SELECT COALESCE(SUM(amount),0) INTO v_collected FROM public.payments;
    SELECT COALESCE(SUM(amount),0) INTO v_expenses FROM public.expenses WHERE approval_status = 'approved';
    v_cash := v_opening + v_collected - v_expenses;

    SELECT COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(amount_paid,0))),0)
      INTO v_receivables FROM public.invoices WHERE is_draft = false;
    SELECT COALESCE(SUM(total_value),0) INTO v_fixed FROM public.company_assets;
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(total_amount,0) - COALESCE(amount_paid,0))),0)
      INTO v_bills FROM public.vendor_bills;
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(amount,0) - COALESCE(paid_amount,0))),0)
      INTO v_payables FROM public.company_liabilities;

    v_liabilities := v_bills + v_payables;
    v_networth := v_cash + v_receivables + v_fixed - v_liabilities;
    v_cash_after := GREATEST(0, v_cash - v_liabilities);
    v_reserve := ROUND(v_cash_after * 0.30, 2);
    v_distributable := ROUND(v_cash_after - v_reserve, 2);

    IF v_reserve > 0 THEN
      INSERT INTO public.company_assets (asset_name, quantity, unit_price, status, notes)
      VALUES (
        'Retained Company Reserve — ' || v_open.year_label,
        1, v_reserve, 'working',
        'Automatically capitalised when ' || v_open.year_label || ' closed on 20 December (30% company reserve).'
      )
      RETURNING id INTO v_asset_id;
    END IF;

    UPDATE public.fiscal_years
    SET status = 'closed',
        closing_net_worth = ROUND(v_networth, 2),
        reserve_amount = v_reserve,
        distributed_amount = v_distributable,
        reserve_asset_id = v_asset_id,
        closing_notes = COALESCE(closing_notes, 'Closed automatically by the system on ' || v_today::text),
        closed_at = now()
    WHERE id = v_open.id;
  END LOOP;

  -- Make sure the cycle covering today is open
  IF v_today <= make_date(EXTRACT(YEAR FROM v_today)::int, 12, 20) THEN
    v_end_year := EXTRACT(YEAR FROM v_today)::int;
  ELSE
    v_end_year := EXTRACT(YEAR FROM v_today)::int + 1;
  END IF;
  v_start := make_date(v_end_year - 1, 12, 21);
  v_end := make_date(v_end_year, 12, 20);
  v_label := 'FY ' || v_end_year::text;

  IF NOT EXISTS (SELECT 1 FROM public.fiscal_years WHERE year_label = v_label) THEN
    INSERT INTO public.fiscal_years (year_label, start_date, end_date, status)
    VALUES (v_label, v_start, v_end, 'open');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_annual_shareholder_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://rokxjikofbbgmwgqowwk.supabase.co/functions/v1/send-annual-report',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"trigger": "yearly"}'::jsonb
  );
END;
$$;

SELECT cron.unschedule('auto-fiscal-year-check') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-fiscal-year-check');
SELECT cron.unschedule('annual-shareholder-report') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'annual-shareholder-report');

SELECT cron.schedule('auto-fiscal-year-check', '5 0 * * *', $$SELECT public.auto_manage_fiscal_year();$$);
SELECT cron.schedule('annual-shareholder-report', '0 6 21 12 *', $$SELECT public.send_annual_shareholder_report();$$);

SELECT public.auto_manage_fiscal_year();