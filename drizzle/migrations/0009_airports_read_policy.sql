GRANT SELECT ON TABLE public.airports TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'airports'
      AND policyname = 'Authenticated users can read airports'
  ) THEN
    CREATE POLICY "Authenticated users can read airports"
    ON public.airports
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;