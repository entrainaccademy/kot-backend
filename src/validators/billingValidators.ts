import { z } from "zod";
import { objectIdSchema } from "./restaurantValidators";

export const createInvoiceSchema = z.object({
  orderId: objectIdSchema,
  discount: z
    .object({
      type: z.enum(["PERCENTAGE", "FIXED"]),
      value: z.number().min(0, "Discount value cannot be negative"),
      reason: z.string().trim().max(200).optional(),
    })
    .optional(),
  serviceCharge: z
    .number()
    .min(0, "Service charge cannot be negative")
    .optional(),
  deliveryCharge: z
    .number()
    .min(0, "Delivery charge cannot be negative")
    .optional(),
  taxType: z.enum(["INTRA_STATE", "INTER_STATE"]).optional(),
  idempotencyKey: z.string().trim().max(100).optional(),
});

export const recordPaymentSchema = z
  .object({
    amount: z
      .number()
      .positive("Payment amount must be greater than zero"),
    paymentMethod: z.enum([
      "CASH",
      "UPI",
      "CARD",
      "NET_BANKING",
      "WALLET",
      "OTHER",
    ]),
    transactionReference: z.string().trim().max(100).optional(),
    cashDetails: z
      .object({
        cashReceived: z
          .number()
          .min(0, "Cash received cannot be negative"),
      })
      .optional(),
    notes: z.string().trim().max(300).optional(),
    idempotencyKey: z.string().trim().max(100).optional(),
  })
  .refine(
    (data) => {
      if (data.paymentMethod === "CASH" && data.cashDetails) {
        return data.cashDetails.cashReceived >= data.amount;
      }
      return true;
    },
    {
      message: "Cash received must be greater than or equal to payment amount",
      path: ["cashDetails", "cashReceived"],
    }
  );

export const refundPaymentSchema = z.object({
  amount: z
    .number()
    .positive("Refund amount must be greater than zero"),
  reason: z
    .string()
    .trim()
    .min(3, "Reason must be at least 3 characters")
    .max(300, "Reason must not exceed 300 characters"),
});

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "ISSUED", "VOID"]).optional(),
  paymentStatus: z
    .enum(["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "VOID"])
    .optional(),
  orderId: objectIdSchema.optional(),
  search: z.string().trim().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  paymentStatus: z.enum(["SUCCESS", "PENDING", "FAILED", "REFUNDED"]).optional(),
  paymentMethod: z
    .enum(["CASH", "UPI", "CARD", "NET_BANKING", "WALLET", "OTHER"])
    .optional(),
  invoiceId: objectIdSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
