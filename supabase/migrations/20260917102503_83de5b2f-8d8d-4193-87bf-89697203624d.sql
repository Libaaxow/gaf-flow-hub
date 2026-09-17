-- Replace definer view with a synced directory table (no SECURITY DEFINER objects)
DROP VIEW IF EXISTS public.staff_directory;

CREATE TABLE IF NOT EXISTS public.staff_directory (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  avatar_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.staff_directory TO authenticated;
GRANT ALL ON public.staff_directory TO service_role;

ALTER TABLE public.staff_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read staff directory" ON public.staff_directory;
CREATE POLICY "Authenticated can read staff directory" ON public.staff_directory
FOR SELECT TO authenticated USING (true);

INSERT INTO public.staff_directory (id, full_name, avatar_url)
SELECT id, full_name, avatar_url FROM public.profiles
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, avatar_url = EXCLUDED.avatar_url;

CREATE OR REPLACE FUNCTION public.sync_staff_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.staff_directory (id, full_name, avatar_url, updated_at)
  VALUES (NEW.id, NEW.full_name, NEW.avatar_url, now())
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name, avatar_url = EXCLUDED.avatar_url, updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_staff_directory() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_staff_directory ON public.profiles;
CREATE TRIGGER trg_sync_staff_directory
AFTER INSERT OR UPDATE OF full_name, avatar_url ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_directory();

-- Revoke API execute on all SECURITY DEFINER trigger functions (they run via triggers only)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;