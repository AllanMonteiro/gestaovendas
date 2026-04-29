DO $$
DECLARE
    target record;
    supabase_role record;
BEGIN
    FOR supabase_role IN
        SELECT rolname
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated')
    LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', supabase_role.rolname);
        EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', supabase_role.rolname);
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
            supabase_role.rolname
        );
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
            supabase_role.rolname
        );
    END LOOP;

    FOR target IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT LIKE 'pg_%'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.tablename);
    END LOOP;
END
$$;
