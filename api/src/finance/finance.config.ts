// Shared finance helpers: config blob, money math, period + document numbering.

import { FeePlanCycle, FeeComponentType } from '../generated/prisma/enums';

export const FINANCE_CONFIG_KEY = 'FINANCE_CONFIG';

export interface FinanceConfig {
  currency: string;
  taxEnabled: boolean;
  taxPct: number; // applied on (subtotal − discount) when taxEnabled
  reminderDaysBefore: number; // "due in N days" reminder window
  overdueReminders: boolean;
  autoInvoice: boolean; // auto-generate recurring invoices
  salaryDayOfMonth: number; // 1..28 — day the payroll run is generated
}

export const DEFAULT_FINANCE_CONFIG: FinanceConfig = {
  currency: 'USD',
  taxEnabled: false,
  taxPct: 0,
  reminderDaysBefore: 1,
  overdueReminders: true,
  autoInvoice: true,
  salaryDayOfMonth: 1,
};

export const FEE_COMPONENT_TYPES: FeeComponentType[] = [
  'ADMISSION',
  'COURSE',
  'REGISTRATION',
  'MATERIAL',
  'EXAMINATION',
  'CERTIFICATE',
  'OTHER',
] as FeeComponentType[];

// Recorded on Payment.method. Real gateway capture is future work — today an
// admin records how the money arrived.
export const PAYMENT_METHODS = [
  'UPI',
  'BANK_TRANSFER',
  'CARD',
  'RAZORPAY',
  'STRIPE',
  'CASH',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Number of months one billing cycle spans (0 = one-time / non-recurring). */
export function cycleMonths(cycle: FeePlanCycle): number {
  switch (cycle) {
    case 'MONTHLY':
      return 1;
    case 'QUARTERLY':
      return 3;
    case 'HALF_YEARLY':
      return 6;
    case 'YEARLY':
      return 12;
    case 'ONE_TIME':
    case 'CUSTOM':
    default:
      return 0;
  }
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Human period label for a recurring invoice, e.g. "March 2026". */
export function periodLabelFor(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

/** Zero-padded document number: PREFIX-YYYY-000001. */
export function formatDocNumber(
  prefix: string,
  year: number,
  seq: number,
): string {
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

export interface DiscountLike {
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
}

/** Money a discount/scholarship removes from a subtotal (never below 0). */
export function discountAmountFor(
  subtotal: number,
  d: DiscountLike | null | undefined,
): number {
  if (!d) return 0;
  const raw = d.type === 'PERCENTAGE' ? (subtotal * d.value) / 100 : d.value;
  return Math.max(0, Math.min(round2(raw), subtotal));
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export interface InvoiceTotalsInput {
  items: { amount: number }[];
  discount?: DiscountLike | null;
  scholarship?: DiscountLike | null;
  taxEnabled?: boolean;
  taxPct?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

/** Single source of truth for invoice arithmetic. */
export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = round2(
    input.items.reduce((s, it) => s + Number(it.amount || 0), 0),
  );
  const dc = discountAmountFor(subtotal, input.discount);
  const sc = discountAmountFor(subtotal - dc, input.scholarship);
  const discountAmount = round2(dc + sc);
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount =
    input.taxEnabled && input.taxPct
      ? round2((taxable * input.taxPct) / 100)
      : 0;
  const total = round2(subtotal - discountAmount + taxAmount);
  return { subtotal, discountAmount, taxAmount, total };
}
