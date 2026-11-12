import { z } from "zod";

export const createRestaurantAdminSchema = z.object({
  restaurant: z.object({
    name: z.string().trim().min(2, { message: "Restaurant name is required" }),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, { message: "Slug must be at least 2 characters" })
      .regex(/^[a-z0-9-]+$/, {
        message: "Slug can only contain lowercase letters, numbers, and hyphens",
      }),
    email: z.string().trim().toLowerCase().email({ message: "Invalid email" }),
    phone: z.string().trim().min(8, { message: "Phone number is required" }),
    currency: z.string().trim().default("INR"),
    timezone: z.string().trim().default("Asia/Kolkata"),
    address: z
      .object({
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
      })
      .optional(),
    taxSettings: z
      .object({
        gstNumber: z.string().optional(),
        defaultTaxRate: z.number().min(0).max(100).default(5),
        isTaxInclusive: z.boolean().default(false),
      })
      .optional(),
  }),
  admin: z.object({
    name: z.string().trim().min(2, { message: "Admin name is required" }),
    email: z.string().trim().toLowerCase().email({ message: "Invalid admin email" }),
    phone: z.string().trim().min(8, { message: "Invalid admin phone" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(/[A-Z]/, { message: "Password must have an uppercase letter" })
      .regex(/[a-z]/, { message: "Password must have a lowercase letter" })
      .regex(/[0-9]/, { message: "Password must have a number" }),
  }),
});

export const updateRestaurantSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(8).optional(),
  logo: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  taxSettings: z
    .object({
      gstNumber: z.string().optional(),
      defaultTaxRate: z.number().min(0).max(100).optional(),
      isTaxInclusive: z.boolean().optional(),
    })
    .optional(),
});

export const updateRestaurantStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]),
  reason: z.string().optional(),
});

export const createPlanSchema = z.object({
  name: z.string().trim().min(2, { message: "Plan name is required" }),
  price: z.number().min(0, { message: "Price cannot be negative" }),
  billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).default("MONTHLY"),
  features: z.array(z.string()).default([]),
  limits: z.object({
    maxTables: z.number().min(1).default(10),
    maxStaff: z.number().min(1).default(5),
    maxOrdersPerMonth: z.number().min(1).default(1000),
    maxMenuItems: z.number().min(1).default(50),
  }),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export const updatePlanSchema = z.object({
  name: z.string().trim().min(2).optional(),
  price: z.number().min(0).optional(),
  billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).optional(),
  features: z.array(z.string()).optional(),
  limits: z
    .object({
      maxTables: z.number().min(1).optional(),
      maxStaff: z.number().min(1).optional(),
      maxOrdersPerMonth: z.number().min(1).optional(),
      maxMenuItems: z.number().min(1).optional(),
    })
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const createSubscriptionSchema = z.object({
  restaurantId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid restaurant ID"),
  planId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid plan ID"),
  billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).default("MONTHLY"),
  startDate: z.string().or(z.date()).optional(),
  paymentStatus: z.enum(["PAID", "PENDING", "FAILED"]).default("PENDING"),
  amountPaid: z.number().min(0).optional(),
});

export const updateSubscriptionSchema = z.object({
  endDate: z.string().or(z.date()).optional(),
  paymentStatus: z.enum(["PAID", "PENDING", "FAILED"]).optional(),
  subscriptionStatus: z.enum(["ACTIVE", "EXPIRED", "TRIAL", "CANCELLED"]).optional(),
  amountPaid: z.number().min(0).optional(),
});

