/*
 * Raw-SQL migration for the Finance & Reporting module.
 * DIRECT_URL (5432) is unreachable, so we apply plain DDL over the pooler
 * (DATABASE_URL), then run `npx prisma generate`. Fully idempotent.
 *
 * Adds: FeePlan, FeePlanComponent, StudentFeeAssignment, InvoiceItem, Receipt,
 * Discount, Scholarship, Refund, PayrollConfig + new columns on
 * Invoice / Payment / Payout, and new values on the InvoiceStatus /
 * PaymentStatus enums.
 *
 * ALTER TYPE ... ADD VALUE cannot share a transaction with usage of the value,
 * and node-postgres sends a multi-statement string as ONE implicit transaction,
 * so the enum-value additions run as their own separate queries first.
 */
require('dotenv/config');
const { Client } = require('pg');

// Each runs in its own implicit transaction (separate client.query calls).
const ENUM_VALUE_ADDS = [
  `ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PENDING'`,
  `ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID'`,
  `ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED'`,
  `ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED'`,
];

const DDL = `
-- ── New enum types (idempotent) ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='FeePlanCycle') THEN
    CREATE TYPE "FeePlanCycle" AS ENUM ('ONE_TIME','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','CUSTOM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='FeeComponentType') THEN
    CREATE TYPE "FeeComponentType" AS ENUM ('ADMISSION','COURSE','REGISTRATION','MATERIAL','EXAMINATION','CERTIFICATE','OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='DiscountType') THEN
    CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE','FIXED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='DiscountReason') THEN
    CREATE TYPE "DiscountReason" AS ENUM ('SCHOLARSHIP','SIBLING','PROMOTIONAL','STAFF','MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ScholarshipStatus') THEN
    CREATE TYPE "ScholarshipStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','APPLIED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='RefundStatus') THEN
    CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','PROCESSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='PayrollModel') THEN
    CREATE TYPE "PayrollModel" AS ENUM ('FIXED','PER_CLASS','PER_HOUR','PER_STUDENT','HYBRID');
  END IF;
END $$;

-- ── FeePlan ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FeePlan" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "cycle"       "FeePlanCycle" NOT NULL DEFAULT 'MONTHLY',
  "courseId"    TEXT,
  "currency"    TEXT NOT NULL DEFAULT 'USD',
  "description" TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeePlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeePlan_active_idx" ON "FeePlan" ("active");

CREATE TABLE IF NOT EXISTS "FeePlanComponent" (
  "id"     TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "type"   "FeeComponentType" NOT NULL DEFAULT 'COURSE',
  "label"  TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "FeePlanComponent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeePlanComponent_planId_idx" ON "FeePlanComponent" ("planId");

CREATE TABLE IF NOT EXISTS "StudentFeeAssignment" (
  "id"           TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "planId"       TEXT NOT NULL,
  "startDate"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextRunAt"    TIMESTAMP(3),
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
  "discountId"   TEXT,
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentFeeAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StudentFeeAssignment_studentId_idx" ON "StudentFeeAssignment" ("studentId");
CREATE INDEX IF NOT EXISTS "StudentFeeAssignment_planId_idx" ON "StudentFeeAssignment" ("planId");
CREATE INDEX IF NOT EXISTS "StudentFeeAssignment_active_idx" ON "StudentFeeAssignment" ("active");

-- ── InvoiceItem ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InvoiceItem" (
  "id"        TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "type"      "FeeComponentType" NOT NULL DEFAULT 'OTHER',
  "label"     TEXT NOT NULL,
  "amount"    DECIMAL(10,2) NOT NULL,
  CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem" ("invoiceId");

-- ── Receipt ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Receipt" (
  "id"        TEXT NOT NULL,
  "number"    TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "paymentId" TEXT,
  "studentId" TEXT,
  "amount"    DECIMAL(10,2) NOT NULL,
  "currency"  TEXT NOT NULL DEFAULT 'USD',
  "method"    TEXT,
  "notes"     TEXT,
  "issuedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_number_key" ON "Receipt" ("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_paymentId_key" ON "Receipt" ("paymentId");
CREATE INDEX IF NOT EXISTS "Receipt_invoiceId_idx" ON "Receipt" ("invoiceId");
CREATE INDEX IF NOT EXISTS "Receipt_studentId_idx" ON "Receipt" ("studentId");

-- ── Discount ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Discount" (
  "id"          TEXT NOT NULL,
  "code"        TEXT,
  "name"        TEXT NOT NULL,
  "type"        "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
  "value"       DECIMAL(10,2) NOT NULL,
  "reason"      "DiscountReason" NOT NULL DEFAULT 'PROMOTIONAL',
  "description" TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Discount_code_key" ON "Discount" ("code");
CREATE INDEX IF NOT EXISTS "Discount_active_idx" ON "Discount" ("active");

-- ── Scholarship ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Scholarship" (
  "id"              TEXT NOT NULL,
  "studentId"       TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "type"            "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
  "value"           DECIMAL(10,2) NOT NULL,
  "reason"          TEXT,
  "status"          "ScholarshipStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById"   TEXT,
  "requestedByName" TEXT,
  "reviewedById"    TEXT,
  "reviewedByName"  TEXT,
  "reviewNotes"     TEXT,
  "appliedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Scholarship_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Scholarship_studentId_idx" ON "Scholarship" ("studentId");
CREATE INDEX IF NOT EXISTS "Scholarship_status_idx" ON "Scholarship" ("status");

-- ── Refund ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Refund" (
  "id"              TEXT NOT NULL,
  "invoiceId"       TEXT,
  "paymentId"       TEXT,
  "studentId"       TEXT,
  "amount"          DECIMAL(10,2) NOT NULL,
  "currency"        TEXT NOT NULL DEFAULT 'USD',
  "reason"          TEXT NOT NULL,
  "method"          TEXT,
  "status"          "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById"   TEXT,
  "requestedByName" TEXT,
  "approvedById"    TEXT,
  "approvedByName"  TEXT,
  "reviewNotes"     TEXT,
  "processedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Refund_status_idx" ON "Refund" ("status");
CREATE INDEX IF NOT EXISTS "Refund_studentId_idx" ON "Refund" ("studentId");

-- ── PayrollConfig ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PayrollConfig" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "model"          "PayrollModel" NOT NULL DEFAULT 'FIXED',
  "baseSalary"     DECIMAL(10,2),
  "perClassRate"   DECIMAL(10,2),
  "perHourRate"    DECIMAL(10,2),
  "perStudentRate" DECIMAL(10,2),
  "standardBonus"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollConfig_userId_key" ON "PayrollConfig" ("userId");

-- ── New columns on existing tables ───────────────────────────────────────────
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "feePlanId"      TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "assignmentId"   TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "periodLabel"    TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "periodStart"    TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "periodEnd"      TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "subtotal"       DECIMAL(10,2);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "taxAmount"      DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAmount"     DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discountId"     TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "scholarshipId"  TEXT;
CREATE INDEX IF NOT EXISTS "Invoice_studentId_idx"    ON "Invoice" ("studentId");
CREATE INDEX IF NOT EXISTS "Invoice_assignmentId_idx" ON "Invoice" ("assignmentId");

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "method"       TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reference"    TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receivedById" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "notes"        TEXT;
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment" ("status");

ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "payslipNo"     TEXT;
ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "payrollModel"  TEXT;
ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "classesCount"  INTEGER;
ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "hoursCount"    DOUBLE PRECISION;
ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "studentsCount" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "Payout_payslipNo_key" ON "Payout" ("payslipNo");

-- ── Foreign keys (cascade integrity) ─────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FeePlanComponent_planId_fkey') THEN
    ALTER TABLE "FeePlanComponent" ADD CONSTRAINT "FeePlanComponent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FeePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StudentFeeAssignment_studentId_fkey') THEN
    ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StudentFeeAssignment_planId_fkey') THEN
    ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FeePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InvoiceItem_invoiceId_fkey') THEN
    ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Receipt_invoiceId_fkey') THEN
    ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Receipt_paymentId_fkey') THEN
    ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Scholarship_studentId_fkey') THEN
    ALTER TABLE "Scholarship" ADD CONSTRAINT "Scholarship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Refund_invoiceId_fkey') THEN
    ALTER TABLE "Refund" ADD CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PayrollConfig_userId_fkey') THEN
    ALTER TABLE "PayrollConfig" ADD CONSTRAINT "PayrollConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

(async () => {
  const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    // Enum-value additions first, each its own transaction.
    for (const stmt of ENUM_VALUE_ADDS) {
      await client.query(stmt);
    }
    await client.query(DDL);
    const { rows } = await client.query(
      `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_name IN
         ('FeePlan','FeePlanComponent','StudentFeeAssignment','InvoiceItem','Receipt','Discount','Scholarship','Refund','PayrollConfig'))::int AS tables,
        (SELECT count(*) FROM information_schema.columns WHERE table_name='Invoice' AND column_name='paidAmount')::int AS inv_paid,
        (SELECT count(*) FROM information_schema.columns WHERE table_name='Payment' AND column_name='method')::int AS pay_method,
        (SELECT count(*) FROM information_schema.columns WHERE table_name='Payout' AND column_name='payslipNo')::int AS payout_slip`,
    );
    const r = rows[0];
    console.log(
      `OK: ${r.tables}/9 finance tables · Invoice.paidAmount ${r.inv_paid} · Payment.method ${r.pay_method} · Payout.payslipNo ${r.payout_slip}`,
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
