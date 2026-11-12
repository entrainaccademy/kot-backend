import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format");

export const updateRestaurantProfileSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().min(8).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
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
  receiptSettings: z
    .object({
      headerText: z.string().optional(),
      footerText: z.string().optional(),
      showLogo: z.boolean().optional(),
      showGst: z.boolean().optional(),
    })
    .optional(),
  operatingHours: z
    .object({
      openTime: z.string().optional(),
      closeTime: z.string().optional(),
      daysOpen: z.array(z.string()).optional(),
    })
    .optional(),
});

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  phone: z.string().trim().min(8, "Phone number is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a number"),
  role: z.enum(["MANAGER", "CASHIER", "WAITER", "KITCHEN_STAFF"]),
  permissions: z.array(z.string()).optional(),
});

export const updateStaffSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(8).optional(),
  role: z.enum(["MANAGER", "CASHIER", "WAITER", "KITCHEN_STAFF"]).optional(),
  permissions: z.array(z.string()).optional(),
});

export const updateStaffStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export const createTableSchema = z.object({
  tableNumber: z.string().trim().min(1, "Table number is required"),
  capacity: z.number().int().min(1, "Capacity must be at least 1").default(4),
  floor: z.string().trim().default("Main Dining"),
  status: z
    .enum(["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"])
    .default("AVAILABLE"),
});

export const updateTableSchema = z.object({
  tableNumber: z.string().trim().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
  floor: z.string().trim().optional(),
  status: z
    .enum(["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"])
    .optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required"),
  description: z.string().trim().optional(),
  sortOrder: z.number().int().default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  categoryId: objectIdSchema,
  price: z.number().min(0, "Price cannot be negative"),
  taxRate: z.number().min(0).max(100).default(5),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  preparationTime: z.number().int().min(1).default(15),
  availability: z.boolean().default(true),
  isVegetarian: z.boolean().default(true),
});

export const updateMenuItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  categoryId: objectIdSchema.optional(),
  price: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  preparationTime: z.number().int().min(1).optional(),
  availability: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
});

