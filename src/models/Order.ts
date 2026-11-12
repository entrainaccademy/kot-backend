import { Schema, model, Document, Types } from "mongoose";

export interface IOrderItem {
  _id?: Types.ObjectId;
  menuItemId: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  submittedQuantity: number; // Quantity already sent to kitchen in KOTs
  taxRate: number; // Snapshot of item tax rate at ordering time
  notes?: string;
  itemTotal: number;
  status: "ACTIVE" | "CANCELLED";
}

export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PLACED"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "BILLED"
  | "COMPLETED"
  | "CANCELLED";

export interface IOrder extends Document {
  restaurantId: Types.ObjectId;
  orderNumber: string;
  tableId?: Types.ObjectId;
  customerId?: Types.ObjectId;
  orderType: OrderType;
  items: IOrderItem[];
  status: OrderStatus;
  subtotal: number;
  tax: number;
  discount: number;
  grandTotal: number;
  createdBy: Types.ObjectId;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: [true, "Menu item ID is required"],
    },
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Item price is required"],
      min: [0, "Price cannot be negative"],
      set: (val: number) => Math.round(val * 100) / 100,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    submittedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxRate: {
      type: Number,
      default: 5,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    itemTotal: {
      type: Number,
      required: [true, "Item total is required"],
      min: [0, "Total cannot be negative"],
      set: (val: number) => Math.round(val * 100) / 100,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { _id: true }
);

const OrderSchema = new Schema<IOrder>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      trim: true,
    },
    tableId: {
      type: Schema.Types.ObjectId,
      ref: "RestaurantTable",
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
    },
    orderType: {
      type: String,
      enum: ["DINE_IN", "TAKEAWAY", "DELIVERY"],
      default: "DINE_IN",
    },
    items: {
      type: [OrderItemSchema],
      validate: [
        (val: IOrderItem[]) => val.length > 0,
        "Order must contain at least one item",
      ],
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "CONFIRMED",
        "PLACED",
        "PREPARING",
        "READY",
        "SERVED",
        "BILLED",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "CONFIRMED",
      index: true,
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    tax: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    grandTotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: [true, "Created by staff ID is required"],
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

// Compound unique index: order number unique within restaurant
OrderSchema.index({ restaurantId: 1, orderNumber: 1 }, { unique: true });
OrderSchema.index({ restaurantId: 1, status: 1 });
OrderSchema.index({ restaurantId: 1, tableId: 1 });
OrderSchema.index({ restaurantId: 1, createdAt: -1 });

export const Order = model<IOrder>("Order", OrderSchema);
