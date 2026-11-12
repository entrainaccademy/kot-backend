import { Schema, model, Document, Types } from "mongoose";

export interface IMenuItem extends Document {
  restaurantId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  taxRate: number; // In percentage (e.g. 5 for 5% GST)
  image?: string;
  availability: boolean;
  preparationTime: number; // in minutes
  isVegetarian: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MenuItemSchema = new Schema<IMenuItem>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "MenuCategory",
      required: [true, "Category ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      set: (val: number) => Math.round(val * 100) / 100,
    },
    taxRate: {
      type: Number,
      default: 5,
      min: [0, "Tax rate cannot be negative"],
      max: [100, "Tax rate cannot exceed 100%"],
    },
    image: {
      type: String,
      trim: true,
    },
    availability: {
      type: Boolean,
      default: true,
      index: true,
    },
    preparationTime: {
      type: Number,
      default: 15,
      min: [1, "Preparation time must be at least 1 minute"],
    },
    isVegetarian: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: item names fast search and uniqueness per category/restaurant
MenuItemSchema.index({ restaurantId: 1, categoryId: 1, name: 1 });
MenuItemSchema.index({ restaurantId: 1, availability: 1 });

export const MenuItem = model<IMenuItem>("MenuItem", MenuItemSchema);
