import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "Invalid email address format" }),
  password: z
    .string()
    .min(1, { message: "Password is required" }),
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, { message: "Current password is required" }),
  newPassword: z
    .string()
    .min(8, { message: "New password must be at least 8 characters long" })
    .regex(/[A-Z]/, { message: "New password must contain at least one uppercase letter" })
    .regex(/[a-z]/, { message: "New password must contain at least one lowercase letter" })
    .regex(/[0-9]/, { message: "New password must contain at least one number" }),
});

export const provisionSuperAdminSchema = z.object({
  name: z.string().trim().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().trim().toLowerCase().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter" })
    .regex(/[a-z]/, { message: "Password must contain at least one lowercase letter" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" }),
});

export const provisionRestaurantSchema = z.object({
  restaurant: z.object({
    name: z.string().trim().min(2, { message: "Restaurant name is required" }),
    slug: z.string().trim().toLowerCase().min(2, { message: "Slug is required" }),
    email: z.string().trim().toLowerCase().email({ message: "Invalid restaurant email" }),
    phone: z.string().trim().min(8, { message: "Invalid phone number" }),
    currency: z.string().trim().default("INR"),
    timezone: z.string().trim().default("Asia/Kolkata"),
    address: z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    }).optional(),
  }),
  admin: z.object({
    name: z.string().trim().min(2, { message: "Admin name is required" }),
    email: z.string().trim().toLowerCase().email({ message: "Invalid admin email" }),
    phone: z.string().trim().min(8, { message: "Invalid admin phone" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters long" })
      .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter" })
      .regex(/[a-z]/, { message: "Password must contain at least one lowercase letter" })
      .regex(/[0-9]/, { message: "Password must contain at least one number" }),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProvisionSuperAdminInput = z.infer<typeof provisionSuperAdminSchema>;
export type ProvisionRestaurantInput = z.infer<typeof provisionRestaurantSchema>;

