-- Phase 2, Step 1: migrate all monetary amounts to integer Ethiopian Birr cents.
-- Existing values are Birr with two decimal places, so multiply by 100 first.

ALTER TABLE menu_items RENAME COLUMN price TO price_cents;
ALTER TABLE sales RENAME COLUMN total_amount TO total_cents;
ALTER TABLE sale_items RENAME COLUMN unit_price TO unit_price_cents;

ALTER TABLE menu_items
  ALTER COLUMN price_cents TYPE INTEGER USING ROUND(price_cents * 100)::INTEGER;
ALTER TABLE sales
  ALTER COLUMN total_cents TYPE INTEGER USING ROUND(total_cents * 100)::INTEGER;
ALTER TABLE sale_items
  ALTER COLUMN unit_price_cents TYPE INTEGER USING ROUND(unit_price_cents * 100)::INTEGER;

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_price_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_price_cents_check CHECK (price_cents >= 0);
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_total_amount_check;
ALTER TABLE sales ADD CONSTRAINT sales_total_cents_check CHECK (total_cents >= 0);
ALTER TABLE sale_items ADD CONSTRAINT sale_items_unit_price_cents_check CHECK (unit_price_cents >= 0);

CREATE OR REPLACE FUNCTION create_sale_with_stock_deduction(
  p_client_generated_id TEXT,
  p_cashier_id UUID,
  p_sale_time TIMESTAMPTZ,
  p_total_cents INTEGER,
  p_payment_type TEXT,
  p_ethiopian_date TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_sale_id UUID;
  v_sale_id UUID;
  v_item JSONB;
  v_menu_item_id UUID;
  v_qty NUMERIC;
  v_unit_price_cents INTEGER;
  v_recipe JSONB;
  v_component JSONB;
  v_ingredient_id UUID;
  v_required_qty NUMERIC;
  v_current_stock NUMERIC;
  v_deductions JSONB := '[]'::JSONB;
BEGIN
  SELECT id INTO v_existing_sale_id FROM sales WHERE client_generated_id = p_client_generated_id;
  IF v_existing_sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_exists', true, 'sale_id', v_existing_sale_id);
  END IF;

  IF p_payment_type NOT IN ('cash', 'telebirr', 'cbe_birr', 'other') THEN
    RAISE EXCEPTION 'Invalid payment_type: %', p_payment_type USING ERRCODE = 'check_violation';
  END IF;
  IF p_total_cents < 0 OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invalid sale payload';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be > 0'; END IF;
    SELECT recipe INTO v_recipe FROM menu_items WHERE id = v_menu_item_id AND is_active = TRUE;
    IF v_recipe IS NULL THEN RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id; END IF;
    FOR v_component IN SELECT * FROM jsonb_array_elements(COALESCE(v_recipe, '[]'::JSONB)) LOOP
      v_ingredient_id := (v_component->>'ingredient_id')::UUID;
      v_required_qty := v_qty * (v_component->>'quantity')::NUMERIC;
      SELECT stock_qty INTO v_current_stock FROM inventory WHERE ingredient_id = v_ingredient_id FOR UPDATE;
      IF NOT FOUND OR v_current_stock < v_required_qty THEN RAISE EXCEPTION 'Insufficient stock for ingredient %', v_ingredient_id USING ERRCODE = 'check_violation'; END IF;
      v_deductions := v_deductions || jsonb_build_object('ingredient_id', v_ingredient_id, 'deduct_qty', v_required_qty);
    END LOOP;
  END LOOP;

  INSERT INTO sales (client_generated_id, cashier_id, sale_time, total_cents, payment_type, ethiopian_date)
  VALUES (p_client_generated_id, p_cashier_id, p_sale_time, p_total_cents, p_payment_type, p_ethiopian_date)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_price_cents := (v_item->>'unit_price_cents')::INTEGER;
    INSERT INTO sale_items (sale_id, menu_item_id, quantity, unit_price_cents) VALUES (v_sale_id, v_menu_item_id, v_qty, v_unit_price_cents);
    SELECT recipe INTO v_recipe FROM menu_items WHERE id = v_menu_item_id;
    FOR v_component IN SELECT * FROM jsonb_array_elements(COALESCE(v_recipe, '[]'::JSONB)) LOOP
      v_ingredient_id := (v_component->>'ingredient_id')::UUID;
      v_required_qty := v_qty * (v_component->>'quantity')::NUMERIC;
      UPDATE inventory SET stock_qty = stock_qty - v_required_qty, updated_at = NOW() WHERE ingredient_id = v_ingredient_id;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'already_exists', false, 'sale_id', v_sale_id, 'client_generated_id', p_client_generated_id, 'deductions', v_deductions);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_existing_sale_id FROM sales WHERE client_generated_id = p_client_generated_id;
  RETURN jsonb_build_object('success', true, 'already_exists', true, 'sale_id', v_existing_sale_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_sale_with_stock_deduction(TEXT, UUID, TIMESTAMPTZ, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_sale_with_stock_deduction(TEXT, UUID, TIMESTAMPTZ, INTEGER, TEXT, TEXT, JSONB) TO anon, authenticated;
