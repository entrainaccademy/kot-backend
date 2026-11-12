import { Schema, model, Document, Types } from "mongoose";

export interface ICustomer extends Document {
  restaurantId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  loyaltyPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    loyaltyPoints: {
      type: Number,
      default: 0,
      min: [0, "Loyalty points cannot be negative"],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: customer search by phone per restaurant
CustomerSchema.index({ restaurantId: 1, phone: 1 }, { unique: true });

export const Customer = model<ICustomer>("Customer", CustomerSchema);

