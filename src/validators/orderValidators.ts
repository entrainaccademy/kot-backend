import { z } from "zod";
import { objectIdSchema } from "./restaurantValidators";

export const createOrderItemInputSchema = z.object({
  menuItemId: objectIdSchema,
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  notes: z.string().trim().max(200).optional(),
});

export const createOrderSchema = z.object({
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).default("DINE_IN"),
  tableId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  items: z
    .array(createOrderItemInputSchema)
    .min(1, "Order must contain at least one item"),
  discount: z.number().min(0).default(0),
  idempotencyKey: z.string().trim().optional(),
});

export const updateOrderSchema = z.object({
  tableId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  discount: z.number().min(0).optional(),
  status: z
    .enum([
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "SERVED",
      "BILLED",
      "COMPLETED",
      "CANCELLED",
    ])
    .optional(),
});

export const addOrderItemsSchema = z.object({
  items: z
    .array(createOrderItemInputSchema)
    .min(1, "At least one item is required to add to order"),
});

export const updateOrderItemSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  notes: z.string().trim().max(200).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(2, "Cancellation reason is required"),
});

export const generateKOTSchema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  idempotencyKey: z.string().trim().optional(),
});

export const updateKOTStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "SERVED",
    "COMPLETED",
    "CANCELLED",
  ]),
});

export const mergeBillsSchema = z.object({
  primaryOrderId: objectIdSchema.optional(),
  orderIds: z.array(objectIdSchema).min(2, "At least two orders are required to merge"),
});


