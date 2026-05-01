from django.db import migrations


SECURITY_SQL = """
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
"""


def harden_public_schema(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(SECURITY_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_add_adjust_finalized_sale_permission"),
        ("audit", "0002_rename_audit_aud_entity_4c9d06_idx_audit_audit_entity_8edb54_idx_and_more"),
        ("catalog", "0005_productstockentry"),
        ("whatsapp", "0001_initial"),
        ("kitchen", "0002_rename_kitchen_ki_status_68f8f0_idx_kitchen_kit_status_154069_idx"),
        ("loyalty", "0004_rename_loyalty_cu_phone_3e5a5a_idx_loyalty_cus_phone_510dd1_idx_and_more"),
        ("orders", "0002_alter_order_status"),
        ("sales", "0016_storeconfig_public_menu_url"),
    ]

    operations = [
        migrations.RunPython(harden_public_schema, migrations.RunPython.noop),
    ]
