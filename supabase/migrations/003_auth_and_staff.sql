-- Phase 2, Step 2: Supabase Auth staff records and audit actor identity.

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'waiter', 'cook', 'cashier')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES staff(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.staff
  WHERE id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;

DROP POLICY IF EXISTS staff_owner_all ON staff;
CREATE POLICY staff_owner_all ON staff FOR ALL TO authenticated
  USING (public.current_staff_role() = 'owner')
  WITH CHECK (public.current_staff_role() = 'owner');

DROP POLICY IF EXISTS staff_manager_select ON staff;
CREATE POLICY staff_manager_select ON staff FOR SELECT TO authenticated
  USING (public.current_staff_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS staff_manager_update_non_owner ON staff;
CREATE POLICY staff_manager_update_non_owner ON staff FOR UPDATE TO authenticated
  USING (public.current_staff_role() = 'manager' AND role <> 'owner')
  WITH CHECK (public.current_staff_role() = 'manager' AND role <> 'owner');

DROP POLICY IF EXISTS staff_self_select ON staff;
CREATE POLICY staff_self_select ON staff FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS audit_logs_owner_manager_select ON audit_logs;
CREATE POLICY audit_logs_owner_manager_select ON audit_logs FOR SELECT TO authenticated
  USING (public.current_staff_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS audit_logs_authenticated_insert ON audit_logs;
CREATE POLICY audit_logs_authenticated_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR staff_id = auth.uid());

DROP POLICY IF EXISTS sales_staff_self_read ON sales;
CREATE POLICY sales_staff_self_read ON sales FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR public.current_staff_role() IN ('owner', 'manager'));

CREATE INDEX IF NOT EXISTS idx_sales_staff_id ON sales(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
