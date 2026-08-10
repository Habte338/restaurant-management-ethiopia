-- ============================================================
-- Restaurant Management System — Ethiopia (Phase 1 simplified)
-- ============================================================

-- 1. Core tables
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    recipe JSONB NOT NULL DEFAULT '[]', -- [{ingredient_id, quantity}]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
    ingredient_id UUID PRIMARY KEY REFERENCES menu_items(id),
    stock_qty NUMERIC(12,3) NOT NULL CHECK (stock_qty >= 0),
    unit TEXT NOT NULL DEFAULT 'pcs',
    reorder_level NUMERIC(12,3) NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_generated_id TEXT NOT NULL UNIQUE,
    cashier_id UUID,                     -- can be null in demo mode
    sale_time TIMESTAMPTZ NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    payment_type TEXT NOT NULL CHECK (payment_type IN ('cash','telebirr','cbe_birr','other')),
    ethiopian_date TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_generated_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory(stock_qty);

-- 2. Atomic sale + stock deduction RPC
CREATE OR REPLACE FUNCTION create_sale_with_stock_deduction(
  p_client_generated_id   TEXT,
  p_cashier_id            UUID,
  p_sale_time             TIMESTAMPTZ,
  p_total_amount          NUMERIC,
  p_payment_type          TEXT,
  p_ethiopian_date        TEXT DEFAULT NULL,
  p_items                 JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_sale_id    UUID;
  v_sale_id             UUID;
  v_item                JSONB;
  v_menu_item_id        UUID;
  v_qty                 NUMERIC;
  v_unit_price          NUMERIC;
  v_recipe              JSONB;
  v_component           JSONB;
  v_ingredient_id       UUID;
  v_required_qty        NUMERIC;
  v_current_stock       NUMERIC;
  v_deductions          JSONB := '[]'::JSONB;
BEGIN
  -- Idempotency
  SELECT id INTO v_existing_sale_id
  FROM sales
  WHERE client_generated_id = p_client_generated_id;

  IF v_existing_sale_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'sale_id', v_existing_sale_id,
      'message', 'Sale already processed (idempotent)'
    );
  END IF;

  IF p_payment_type NOT IN ('cash', 'telebirr', 'cbe_birr', 'other') THEN
    RAISE EXCEPTION 'Invalid payment_type: %', p_payment_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty array';
  END IF;

  -- Pre-check + lock inventory
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::UUID;
    v_qty          := (v_item->>'quantity')::NUMERIC;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be > 0';
    END IF;

    SELECT recipe INTO v_recipe
    FROM menu_items
    WHERE id = v_menu_item_id AND is_active = TRUE;

    IF v_recipe IS NULL THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id;
    END IF;

    FOR v_component IN SELECT * FROM jsonb_array_elements(COALESCE(v_recipe, '[]'::JSONB))
    LOOP
      v_ingredient_id := (v_component->>'ingredient_id')::UUID;
      v_required_qty  := v_qty * (v_component->>'quantity')::NUMERIC;

      SELECT stock_qty INTO v_current_stock
      FROM inventory
      WHERE ingredient_id = v_ingredient_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No inventory record for ingredient %', v_ingredient_id;
      END IF;

      IF v_current_stock < v_required_qty THEN
        RAISE EXCEPTION 'Insufficient stock for ingredient %. Required: %, Available: %',
          v_ingredient_id, v_required_qty, v_current_stock
          USING ERRCODE = 'check_violation';
      END IF;

      v_deductions := v_deductions || jsonb_build_object(
        'ingredient_id', v_ingredient_id,
        'deduct_qty', v_required_qty
      );
    END LOOP;
  END LOOP;

  -- All good → write
  INSERT INTO sales (
    client_generated_id, cashier_id, sale_time,
    total_amount, payment_type, ethiopian_date
  ) VALUES (
    p_client_generated_id, p_cashier_id, p_sale_time,
    p_total_amount, p_payment_type, p_ethiopian_date
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::UUID;
    v_qty          := (v_item->>'quantity')::NUMERIC;
    v_unit_price   := (v_item->>'unit_price')::NUMERIC;

    INSERT INTO sale_items (sale_id, menu_item_id, quantity, unit_price)
    VALUES (v_sale_id, v_menu_item_id, v_qty, v_unit_price);

    SELECT recipe INTO v_recipe FROM menu_items WHERE id = v_menu_item_id;

    FOR v_component IN SELECT * FROM jsonb_array_elements(COALESCE(v_recipe, '[]'::JSONB))
    LOOP
      v_ingredient_id := (v_component->>'ingredient_id')::UUID;
      v_required_qty  := v_qty * (v_component->>'quantity')::NUMERIC;

      UPDATE inventory
      SET stock_qty = stock_qty - v_required_qty,
          updated_at = NOW()
      WHERE ingredient_id = v_ingredient_id;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'sale_id', v_sale_id,
    'client_generated_id', p_client_generated_id,
    'deductions', v_deductions
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_sale_id
    FROM sales WHERE client_generated_id = p_client_generated_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'sale_id', v_existing_sale_id,
      'message', 'Sale already processed (race resolved)'
    );
END;
$$;

-- 3. Seed data (demo café)
-- First create some “ingredient” menu items (they also appear in inventory)
INSERT INTO menu_items (id, name, price, recipe) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Shiro Powder (kg)', 0, '[]'),
  ('a0000000-0000-0000-0000-000000000002', 'Injera (pcs)', 0, '[]'),
  ('a0000000-0000-0000-0000-000000000003', 'Oil (litre)', 0, '[]'),
  ('a0000000-0000-0000-0000-000000000004', 'Onion (kg)', 0, '[]')
ON CONFLICT DO NOTHING;

INSERT INTO inventory (ingredient_id, stock_qty, unit, reorder_level) VALUES
  ('a0000000-0000-0000-0000-000000000001', 25.000, 'kg', 5),
  ('a0000000-0000-0000-0000-000000000002', 120, 'pcs', 30),
  ('a0000000-0000-0000-0000-000000000003', 8.500, 'litre', 2),
  ('a0000000-0000-0000-0000-000000000004', 15.000, 'kg', 3)
ON CONFLICT DO NOTHING;

-- Finished dishes with recipes
INSERT INTO menu_items (id, name, price, recipe) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Shiro', 120.00,
    '[{"ingredient_id":"a0000000-0000-0000-0000-000000000001","quantity":0.15},
      {"ingredient_id":"a0000000-0000-0000-0000-000000000003","quantity":0.05},
      {"ingredient_id":"a0000000-0000-0000-0000-000000000004","quantity":0.08}]'),
  ('b0000000-0000-0000-0000-000000000002', 'Injera + Shiro', 150.00,
    '[{"ingredient_id":"a0000000-0000-0000-0000-000000000001","quantity":0.15},
      {"ingredient_id":"a0000000-0000-0000-0000-000000000002","quantity":2},
      {"ingredient_id":"a0000000-0000-0000-0000-000000000003","quantity":0.05},
      {"ingredient_id":"a0000000-0000-0000-0000-000000000004","quantity":0.08}]'),
  ('b0000000-0000-0000-0000-000000000003', 'Tea', 25.00, '[]'),
  ('b0000000-0000-0000-0000-000000000004', 'Coffee', 30.00, '[]')
ON CONFLICT DO NOTHING;

-- Grant execute to authenticated & anon (for demo)
GRANT EXECUTE ON FUNCTION create_sale_with_stock_deduction TO anon, authenticated;
