import { Schema, model, Document, Types } from "mongoose";

export interface IAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface ITaxSettings {
  gstNumber?: string;
  defaultTaxRate: number; // In percentage, e.g. 5.0 for 5% GST
  isTaxInclusive: boolean;
}

export interface IReceiptSettings {
  headerText?: string;
  footerText?: string;
  showLogo?: boolean;
  showGst?: boolean;
}

export interface IOperatingHours {
  openTime?: string; // e.g. "09:00"
  closeTime?: string; // e.g. "23:00"
  daysOpen?: string[]; // e.g. ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
}

export interface IRestaurant extends Document {
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: IAddress;
  logo?: string;
  currency: string;
  timezone: string;
  taxSettings: ITaxSettings;
  receiptSettings?: IReceiptSettings;
  operatingHours?: IOperatingHours;
  subscriptionId?: Types.ObjectId;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING_SETUP";
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<IAddress>(
  {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, default: "India", trim: true },
  },
  { _id: false }
);

const TaxSettingsSchema = new Schema<ITaxSettings>(
  {
    gstNumber: { type: String, trim: true },
    defaultTaxRate: { type: Number, default: 5, min: 0, max: 100 },
    isTaxInclusive: { type: Boolean, default: false },
  },
  { _id: false }
);

const ReceiptSettingsSchema = new Schema<IReceiptSettings>(
  {
    headerText: { type: String, trim: true },
    footerText: { type: String, trim: true },
    showLogo: { type: Boolean, default: true },
    showGst: { type: Boolean, default: true },
  },
  { _id: false }
);

const OperatingHoursSchema = new Schema<IOperatingHours>(
  {
    openTime: { type: String, default: "10:00", trim: true },
    closeTime: { type: String, default: "23:00", trim: true },
    daysOpen: {
      type: [String],
      default: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
  },
  { _id: false }
);

const RestaurantSchema = new Schema<IRestaurant>(
  {
    name: {
      type: String,
      required: [true, "Restaurant name is required"],
      trim: true,
      maxlength: 150,
    },
    slug: {
      type: String,
      required: [true, "Restaurant slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Contact email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Contact phone is required"],
      trim: true,
    },
    address: {
      type: AddressSchema,
      default: () => ({}),
    },
    logo: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    taxSettings: {
      type: TaxSettingsSchema,
      default: () => ({ defaultTaxRate: 5, isTaxInclusive: false }),
    },
    receiptSettings: {
      type: ReceiptSettingsSchema,
      default: () => ({
        showLogo: true,
        showGst: true,
      }),
    },
    operatingHours: {
      type: OperatingHoursSchema,
      default: () => ({
        openTime: "10:00",
        closeTime: "23:00",
        daysOpen: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      }),
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_SETUP"],
      default: "PENDING_SETUP",
    },
  },
  {
    timestamps: true,
  }
);

export const Restaurant = model<IRestaurant>("Restaurant", RestaurantSchema);
