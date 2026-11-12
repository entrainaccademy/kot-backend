import { Schema, model, Document, Types } from "mongoose";

export type PaymentMethod =
  | "CASH"
  | "UPI"
  | "CARD"
  | "NET_BANKING"
  | "WALLET"
  | "OTHER";

export type PaymentStatus = "SUCCESS" | "PENDING" | "FAILED" | "REFUNDED";

export type RefundStatus = "NONE" | "PARTIAL" | "FULL";

export interface ICashDetails {
  cashReceived: number;
  changeReturned: number;
}

export interface IRefundRecord {
  amount: number;
  reason: string;
  refundedBy: Types.ObjectId;
  createdAt: Date;
}

export interface IPayment extends Document {
  restaurantId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  orderId?: Types.ObjectId;
  paymentNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionReference?: string;
  paymentStatus: PaymentStatus;
  cashDetails?: ICashDetails;
  recordedBy: Types.ObjectId;
  notes?: string;
  idempotencyKey?: string;
  refundStatus: RefundStatus;
  refundedAmount: number;
  refundHistory: IRefundRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const CashDetailsSchema = new Schema<ICashDetails>(
  {
    cashReceived: {
      type: Number,
      required: true,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    changeReturned: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
  },
  { _id: false }
);

const RefundRecordSchema = new Schema<IRefundRecord>(
  {
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    refundedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const PaymentSchema = new Schema<IPayment>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: [true, "Invoice ID is required"],
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },
    paymentNumber: {
      type: String,
      required: [true, "Payment number is required"],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0.01, "Amount must be greater than zero"],
      set: (val: number) => Math.round(val * 100) / 100,
    },
    paymentMethod: {
      type: String,
      enum: ["CASH", "UPI", "CARD", "NET_BANKING", "WALLET", "OTHER"],
      required: [true, "Payment method is required"],
    },
    transactionReference: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    paymentStatus: {
      type: String,
      enum: ["SUCCESS", "PENDING", "FAILED", "REFUNDED"],
      default: "SUCCESS",
      index: true,
    },
    cashDetails: {
      type: CashDetailsSchema,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: [true, "Recorded by staff ID is required"],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      index: true,
    },
    refundStatus: {
      type: String,
      enum: ["NONE", "PARTIAL", "FULL"],
      default: "NONE",
      index: true,
    },
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
      set: (val: number) => Math.round(val * 100) / 100,
    },
    refundHistory: {
      type: [RefundRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

PaymentSchema.index({ restaurantId: 1, invoiceId: 1 });
PaymentSchema.index({ restaurantId: 1, paymentNumber: 1 }, { unique: true });
PaymentSchema.index({ restaurantId: 1, paymentStatus: 1 });
PaymentSchema.index({ restaurantId: 1, createdAt: -1 });
PaymentSchema.index(
  { restaurantId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);

export const Payment = model<IPayment>("Payment", PaymentSchema);
