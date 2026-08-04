import { Injectable } from '@nestjs/common';

export interface WiseRecipient {
  name?: string | null;
  country?: string | null;
  bankName?: string | null;
  iban?: string | null;
  swift?: string | null;
  wiseRecipientId?: string | null;
  currency?: string | null;
}

export interface WiseTransferResult {
  status: 'SUCCESS' | 'FAILED';
  reference?: string;
  failureReason?: string;
}

/*
 * MOCK Wise integration (Module 6C). Mirrors the real Wise transfer contract —
 * validate recipient details, create a transfer, return a reference or a
 * failure — WITHOUT calling the network or moving real money. Swapping in the
 * real Wise SDK later is a matter of replacing `createTransfer` with a live
 * call; every caller already handles the SUCCESS/FAILED shape it returns.
 */
@Injectable()
export class WiseService {
  /** Recipient fields the real Wise API requires before a transfer. */
  private missingFields(r: WiseRecipient): string[] {
    const missing: string[] = [];
    if (!r.name?.trim()) missing.push('recipient name');
    if (!r.country?.trim()) missing.push('country');
    if (!r.bankName?.trim()) missing.push('bank name');
    if (!r.iban?.trim()) missing.push('IBAN / account number');
    if (!r.swift?.trim()) missing.push('SWIFT code');
    if (!r.wiseRecipientId?.trim()) missing.push('Wise recipient ID');
    if (!r.currency?.trim()) missing.push('currency');
    return missing;
  }

  validate(r: WiseRecipient): { ok: boolean; missing: string[] } {
    const missing = this.missingFields(r);
    return { ok: missing.length === 0, missing };
  }

  /*
   * Create a (mock) transfer. Fails deterministically when recipient details
   * are incomplete — the same reason a real Wise call would reject — otherwise
   * succeeds with a unique transaction reference.
   */
  createTransfer(input: { recipient: WiseRecipient; amount: number; currency: string }): WiseTransferResult {
    const missing = this.missingFields(input.recipient);
    if (missing.length) {
      return { status: 'FAILED', failureReason: `Missing payment details: ${missing.join(', ')}.` };
    }
    if (!(input.amount > 0)) {
      return { status: 'FAILED', failureReason: 'Payment amount must be greater than zero.' };
    }
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const reference = `WISE-${Date.now()}-${rand}`;
    return { status: 'SUCCESS', reference };
  }
}
