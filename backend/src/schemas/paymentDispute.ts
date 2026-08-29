import { z } from 'zod'

export const paymentDisputeReasonSchema = z.enum([
  'amount_discrepancy',
  'duplicate_charge',
  'service_not_received',
  'early_termination',
  'property_issue',
  'other',
])

export const paymentDisputeStatusSchema = z.enum([
  'pending',
  'under_review',
  'resolved',
  'rejected',
])

export const paymentDisputeCreateSchema = z.object({
  paymentId: z.string().uuid(),
  /**
   * The deal_escrow deal this dispute is challenging a pending rent release
   * for. paymentId alone does not resolve to a deal anywhere in this
   * codebase, so it's captured explicitly at filing time — the frontend
   * already has it via the payment's own `dealId` field.
   */
  dealId: z.string().min(1),
  reason: paymentDisputeReasonSchema,
  description: z.string().min(10).max(1000),
  evidenceKeys: z.array(z.string()).max(5).optional(),
})

export type PaymentDisputeReason = z.infer<typeof paymentDisputeReasonSchema>
export type PaymentDisputeStatus = z.infer<typeof paymentDisputeStatusSchema>
export type PaymentDisputeCreate = z.infer<typeof paymentDisputeCreateSchema>

export interface PaymentDispute {
  id: string
  userId: string
  paymentId: string
  dealId: string | null
  reason: PaymentDisputeReason
  description: string
  evidenceKeys: string[]
  status: PaymentDisputeStatus
  resolution: string | null
  resolvedBy: string | null
  createdAt: Date
  updatedAt: Date
}