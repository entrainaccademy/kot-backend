import { Schema, model, Document, Types } from "mongoose";

export interface ISupplier extends Document {
  restaurantId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      required: [true, "Supplier phone is required"],
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
  },
  {
    timestamps: true,
  }
);

// Compound unique index: supplier name unique per restaurant
SupplierSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

export const Supplier = model<ISupplier>("Supplier", SupplierSchema);

