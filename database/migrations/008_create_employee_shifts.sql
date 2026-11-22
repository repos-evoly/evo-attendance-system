-- Migration: 008_create_employee_shifts.sql
-- Description: Create employee_shifts table for forward-only Shift Assignment history
-- Proposed Go-Live Date: 2026-12-01

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS "employee_shifts" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "shift_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_shifts_employee_id_fkey" FOREIGN KEY ("employee_id")
        REFERENCES "employee"("employee_id")
        ON DELETE NO ACTION
        ON UPDATE NO ACTION,
    CONSTRAINT "employee_shifts_shift_id_fkey" FOREIGN KEY ("shift_id")
        REFERENCES "shifts"("shift_id")
        ON DELETE NO ACTION
        ON UPDATE NO ACTION,
    CONSTRAINT "employee_shifts_date_order_check" CHECK (
        "end_date" IS NULL OR "end_date" >= "start_date"
    )
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS "employee_shifts_employee_id_start_date_idx"
ON "employee_shifts"("employee_id", "start_date");

CREATE INDEX IF NOT EXISTS "employee_shifts_shift_id_idx"
ON "employee_shifts"("shift_id");

-- ============================================
-- 3. INITIAL FORWARD-ONLY ASSIGNMENT INSERT
-- ============================================
-- Inserts one initial record starting on the agreed go-live date (2026-12-01)
-- for each currently active employee with a non-null shift_id.
-- Safely idempotent via NOT EXISTS check. Does NOT modify employee.shift_id.

INSERT INTO "employee_shifts" ("employee_id", "shift_id", "start_date", "end_date")
SELECT
    e.employee_id,
    e.shift_id,
    DATE '2026-12-01',
    NULL
FROM "employee" e
WHERE e.is_active = TRUE
  AND e.shift_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "employee_shifts" es
      WHERE es.employee_id = e.employee_id
        AND es.start_date = DATE '2026-12-01'
  );
