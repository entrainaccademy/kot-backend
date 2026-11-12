import { Schema, model, Document, Types } from "mongoose";

export type InvoicePaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "REFUNDED"
  | "VOID";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "VOID";

export interface IInvoiceItemSnapshot {
  menuItemId: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  taxRate: number;
  itemTotal: number;
  discount?: number;
}

export interface ITaxBreakdownItem {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface ITaxDetails {
  taxType: "INTRA_STATE" | "INTER_STATE";
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  breakdown: ITaxBreakdownItem[];
}

export interface IDiscountDetails {
  type: "PERCENTAGE" | "FIXED";
  value: number;
  amount: number;
  reason?: string;
}

export interface ICustomerSnapshot {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
}

export interface IRestaurantSnapshot {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  currency?: string;
}

export interface IInvoice extends Document {
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  invoiceNumber: string;
  customerId?: Types.ObjectId;
  customerSnapshot?: ICustomerSnapshot;
  restaurantSnapshot?: IRestaurantSnapshot;
  tableNumber?: string;
  orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  items: IInvoiceItemSnapshot[];
  subtotal: number;
  tax: number;
  taxDetails: ITaxDetails;
  discount: number;
  discountDetails?: IDiscountDetails;
  serviceCharge: number;
  deliveryCharge: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: InvoicePaymentStatus;
  status: InvoiceStatus;
  issuedAt: Date;
  createdBy: Types.ObjectId;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSnapshotSchema = new Schema<IInvoiceItemSnapshot>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    price: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    quantity: { type: Number, required: true, min: 1 },
    taxRate: { type: Number, default: 0, min: 0 },
    itemTotal: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
  },
  { _id: false }
);

const TaxBreakdownItemSchema = new Schema<ITaxBreakdownItem>(
  {
    rate: { type: Number, required: true, min: 0 },
    taxableAmount: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    cgst: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    sgst: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    igst: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
  },
  { _id: false }
);

const TaxDetailsSchema = new Schema<ITaxDetails>(
  {
    taxType: {
      type: String,
      enum: ["INTRA_STATE", "INTER_STATE"],
      default: "INTRA_STATE",
    },
    cgst: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    sgst: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    igst: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    totalTax: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    breakdown: {
      type: [TaxBreakdownItemSchema],
      default: [],
    },
  },
  { _id: false }
);

const DiscountDetailsSchema = new Schema<IDiscountDetails>(
  {
    type: {
      type: String,
      enum: ["PERCENTAGE", "FIXED"],
      required: true,
    },
    value: { type: Number, required: true, min: 0 },
    amount: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    reason: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false }
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order ID is required"],
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      trim: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
    },
    customerSnapshot: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      gstin: { type: String, trim: true },
      address: { type: String, trim: true },
    },
    restaurantSnapshot: {
      name: { type: String, trim: true },
      address: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      gstin: { type: String, trim: true },
      currency: { type: String, trim: true, default: "INR" },
    },
    tableNumber: {
      type: String,
      trim: true,
    },
    orderType: {
      type: String,
      enum: ["DINE_IN", "TAKEAWAY", "DELIVERY"],
      default: "DINE_IN",
    },
    items: {
      type: [InvoiceItemSnapshotSchema],
      default: [],
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    tax: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    taxDetails: {
      type: TaxDetailsSchema,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    discountDetails: {
      type: DiscountDetailsSchema,
    },
    serviceCharge: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    roundOff: {
      type: Number,
      default: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    balanceAmount: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "VOID"],
      default: "UNPAID",
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "ISSUED", "VOID"],
      default: "ISSUED",
      index: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: [true, "Staff ID is required"],
    },
    idempotencyKey: {
      type: String,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique indexes
InvoiceSchema.index({ restaurantId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ restaurantId: 1, orderId: 1 });
InvoiceSchema.index({ restaurantId: 1, paymentStatus: 1 });
InvoiceSchema.index({ restaurantId: 1, status: 1 });
InvoiceSchema.index({ restaurantId: 1, createdAt: -1 });
InvoiceSchema.index(
  { restaurantId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);

export const Invoice = model<IInvoice>("Invoice", InvoiceSchema);
