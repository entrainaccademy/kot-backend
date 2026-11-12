import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/database";
import { Restaurant } from "../models/Restaurant";
import { SubscriptionPlan } from "../models/SubscriptionPlan";
import { Subscription } from "../models/Subscription";
import { Staff } from "../models/Staff";
import { MenuCategory } from "../models/MenuCategory";
import { MenuItem } from "../models/MenuItem";
import { RestaurantTable } from "../models/RestaurantTable";
import { hashPassword } from "../utils/password";
import { DEFAULT_ROLE_PERMISSIONS } from "../utils/permissions";

async function seedRestaurantData() {
  console.log("==================================================");
  console.log("  SEEDING RESTAURANT, TABLES, MENU & STAFF USERS  ");
  console.log("==================================================\n");

  const connected = await connectDB();
  if (!connected) {
    console.error("Database connection failed. Please ensure your IP is whitelisted on MongoDB Atlas.");
    process.exit(1);
  }

  try {
    // 1. Subscription Plan
    let plan = await SubscriptionPlan.findOne({ name: "Standard Plan" });
    if (!plan) {
      plan = await SubscriptionPlan.create({
        name: "Standard Plan",
        price: 2999,
        billingCycle: "MONTHLY",
        features: ["KOT Generation", "POS Billing", "Table Management", "Reporting"],
        limits: { maxStaff: 20, maxMenuItems: 200, maxTables: 50 },
        status: "ACTIVE",
      });
      console.log("[OK] Created Subscription Plan: Standard Plan");
    }

    // 2. Restaurant
    let restaurant = await Restaurant.findOne({ slug: "cobolt-kitchen" });
    if (!restaurant) {
      restaurant = await Restaurant.create({
        name: "Cobolt Kitchen & Bar",
        slug: "cobolt-kitchen",
        email: "contact@cobolt.com",
        phone: "+91 9876543210",
        address: {
          street: "100 Feet Road, Indiranagar",
          city: "Bangalore",
          state: "Karnataka",
          postalCode: "560038",
          country: "India",
        },
        currency: "INR",
        timezone: "Asia/Kolkata",
        taxSettings: {
          gstNumber: "29AAAAA0000A1Z5",
          defaultTaxRate: 5,
          isTaxInclusive: false,
        },
        receiptSettings: {
          headerText: "Welcome to Cobolt Kitchen",
          footerText: "Thank you for dining with us!",
          showLogo: true,
          showGst: true,
        },
        status: "ACTIVE",
      });
      console.log(`[OK] Created Restaurant: ${restaurant.name} (ID: ${restaurant._id})`);
    }

    // 3. Subscription
    let subscription = await Subscription.findOne({ restaurantId: restaurant._id });
    if (!subscription) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 365); // 1 year active

      subscription = await Subscription.create({
        restaurantId: restaurant._id,
        planId: plan._id,
        startDate: now,
        endDate: end,
        paymentStatus: "PAID",
        subscriptionStatus: "ACTIVE",
      });
      restaurant.subscriptionId = subscription._id;
      await restaurant.save();
      console.log("[OK] Activated 1-Year SaaS Subscription");
    }

    // 4. Staff Accounts
    const defaultPasswordHash = await hashPassword("Password@123");

    // 4a. Restaurant Admin
    let admin = await Staff.findOne({ email: "admin@cobolt.com" });
    if (!admin) {
      admin = await Staff.create({
        restaurantId: restaurant._id,
        name: "Cobolt Admin",
        email: "admin@cobolt.com",
        phone: "+91 9876500001",
        passwordHash: defaultPasswordHash,
        role: "ADMIN",
        permissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        status: "ACTIVE",
      });
      console.log("[OK] Created Staff Admin: admin@cobolt.com / Password@123");
    }

    // 4b. Cashier / Billing Staff
    let cashier = await Staff.findOne({ email: "cashier@cobolt.com" });
    if (!cashier) {
      cashier = await Staff.create({
        restaurantId: restaurant._id,
        name: "Counter Cashier",
        email: "cashier@cobolt.com",
        phone: "+91 9876500002",
        passwordHash: defaultPasswordHash,
        role: "CASHIER",
        permissions: [
          ...DEFAULT_ROLE_PERMISSIONS.CASHIER,
          "orders:create", // Allows cashier to take orders and bill
        ],
        status: "ACTIVE",
      });
      console.log("[OK] Created Staff Cashier: cashier@cobolt.com / Password@123");
    }

    // 5. Menu Categories
    const categoriesData = [
      { name: "Starters", displayOrder: 1 },
      { name: "Main Course", displayOrder: 2 },
      { name: "Breads & Rice", displayOrder: 3 },
      { name: "Beverages", displayOrder: 4 },
      { name: "Desserts", displayOrder: 5 },
    ];

    const categoryMap: Record<string, any> = {};
    for (const cat of categoriesData) {
      let existingCat = await MenuCategory.findOne({
        restaurantId: restaurant._id,
        name: cat.name,
      });
      if (!existingCat) {
        existingCat = await MenuCategory.create({
          restaurantId: restaurant._id,
          name: cat.name,
          sortOrder: cat.displayOrder,
          status: "ACTIVE",
        });
      }
      categoryMap[cat.name] = existingCat._id;
    }
    console.log("[OK] Verified 5 Menu Categories");

    // 6. Menu Items
    const itemsData = [
      {
        name: "Paneer Tikka",
        category: "Starters",
        price: 260,
        taxRate: 5,
        isVeg: true,
        description: "Chargrilled cottage cheese marinated with Indian spices",
      },
      {
        name: "Chicken Malai Tikka",
        category: "Starters",
        price: 320,
        taxRate: 5,
        isVeg: false,
        description: "Creamy boneless chicken tenders cooked in tandoor",
      },
      {
        name: "Butter Chicken",
        category: "Main Course",
        price: 380,
        taxRate: 5,
        isVeg: false,
        description: "Classic tender chicken simmered in rich makhani gravy",
      },
      {
        name: "Dal Makhani",
        category: "Main Course",
        price: 290,
        taxRate: 5,
        isVeg: true,
        description: "Slow-cooked black lentils finished with cream and butter",
      },
      {
        name: "Garlic Butter Naan",
        category: "Breads & Rice",
        price: 65,
        taxRate: 5,
        isVeg: true,
        description: "Clay oven baked flatbread topped with toasted garlic",
      },
      {
        name: "Dum Biryani",
        category: "Breads & Rice",
        price: 340,
        taxRate: 5,
        isVeg: false,
        description: "Fragrant basmati rice cooked with saffron and spices",
      },
      {
        name: "Fresh Lime Soda",
        category: "Beverages",
        price: 90,
        taxRate: 12,
        isVeg: true,
        description: "Refreshing sweetened lime soda with rock salt",
      },
      {
        name: "Cold Brew Coffee",
        category: "Beverages",
        price: 150,
        taxRate: 12,
        isVeg: true,
        description: "Signature 18-hour cold brew Arabica coffee",
      },
      {
        name: "Gulab Jamun (2 Pcs)",
        category: "Desserts",
        price: 110,
        taxRate: 5,
        isVeg: true,
        description: "Warm condensed milk dumplings soaked in cardamom syrup",
      },
    ];

    for (const it of itemsData) {
      const catId = categoryMap[it.category];
      const existing = await MenuItem.findOne({
        restaurantId: restaurant._id,
        name: it.name,
      });
      if (!existing && catId) {
        await MenuItem.create({
          restaurantId: restaurant._id,
          categoryId: catId,
          name: it.name,
          price: it.price,
          taxRate: it.taxRate,
          isVegetarian: it.isVeg,
          description: it.description,
          availability: true,
          preparationTime: 15,
        });
      }
    }
    console.log("[OK] Verified 9 Food Menu Items");

    // 7. Restaurant Tables
    const tablesData = [
      { tableNumber: "T-01", capacity: 4, floor: "Main Dining" },
      { tableNumber: "T-02", capacity: 4, floor: "Main Dining" },
      { tableNumber: "T-03", capacity: 6, floor: "Main Dining" },
      { tableNumber: "T-04", capacity: 2, floor: "Balcony" },
      { tableNumber: "T-05", capacity: 4, floor: "Balcony" },
      { tableNumber: "T-06", capacity: 8, floor: "Private Dining" },
    ];

    for (const t of tablesData) {
      const existing = await RestaurantTable.findOne({
        restaurantId: restaurant._id,
        tableNumber: t.tableNumber,
      });
      if (!existing) {
        await RestaurantTable.create({
          restaurantId: restaurant._id,
          tableNumber: t.tableNumber,
          capacity: t.capacity,
          floor: t.floor,
          status: "AVAILABLE",
        });
      }
    }
    console.log("[OK] Verified 6 Dining Tables");

    console.log("\n==================================================");
    console.log("  SEED COMPLETED SUCCESSFULLY!                    ");
    console.log("==================================================");
    console.log("\nStaff Login Credentials:");
    console.log("1. Cashier Role (POS Terminal):");
    console.log("   Email:    cashier@cobolt.com");
    console.log("   Password: Password@123\n");
    console.log("2. Admin Role (Full Restaurant Management):");
    console.log("   Email:    admin@cobolt.com");
    console.log("   Password: Password@123\n");

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    await disconnectDB();
    process.exit(1);
  }
}

seedRestaurantData();
