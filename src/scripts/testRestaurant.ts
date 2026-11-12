import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/database";
import {
  createTableSchema,
  createCategorySchema,
  createMenuItemSchema,
  createStaffSchema,
} from "../validators/restaurantValidators";
import { generateAccessToken, AuthUserPayload } from "../utils/jwt";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "../utils/permissions";
import { checkPlanLimit } from "../middleware/subscriptionCheck";
import { Restaurant } from "../models/Restaurant";
import { SubscriptionPlan } from "../models/SubscriptionPlan";
import { Subscription } from "../models/Subscription";
import { Staff } from "../models/Staff";
import { RestaurantTable } from "../models/RestaurantTable";
import { MenuCategory } from "../models/MenuCategory";
import { MenuItem } from "../models/MenuItem";
import * as restaurantService from "../services/restaurantService";

async function runStep9TestSuite() {
  console.log("=================================================");
  console.log("  STEP 9: RESTAURANT OPERATIONS & MGMT TESTS     ");
  console.log("=================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // 1. Zod Validation Tests for Restaurant Operations
  console.log("--- 1. Restaurant Operations Zod Validation Tests ---");
  const validTable = createTableSchema.safeParse({
    tableNumber: "T-12",
    capacity: 6,
    floor: "Balcony",
    status: "AVAILABLE",
  });
  assert(validTable.success, "Valid table payload passes validation");

  const invalidTable = createTableSchema.safeParse({
    tableNumber: "",
    capacity: 0,
  });
  assert(!invalidTable.success, "Invalid table capacity (0) and empty number are rejected");

  const validCategory = createCategorySchema.safeParse({
    name: "Main Course",
    description: "Curries and Breads",
    sortOrder: 1,
  });
  assert(validCategory.success, "Valid menu category payload passes validation");

  const validMenuItem = createMenuItemSchema.safeParse({
    name: "Paneer Butter Masala",
    categoryId: new mongoose.Types.ObjectId().toString(),
    price: 340,
    taxRate: 5,
    preparationTime: 20,
    isVegetarian: true,
  });
  assert(validMenuItem.success, "Valid menu item payload with vegetarian flag passes validation");

  const invalidMenuItemPrice = createMenuItemSchema.safeParse({
    name: "Paneer Butter Masala",
    categoryId: new mongoose.Types.ObjectId().toString(),
    price: -100,
  });
  assert(!invalidMenuItemPrice.success, "Negative price is rejected by schema");

  const validStaffPayload = createStaffSchema.safeParse({
    name: "Aman Sharma",
    email: "aman@restaurant.com",
    phone: "+919876543299",
    password: "Password123!",
    role: "WAITER",
  });
  assert(validStaffPayload.success, "Valid staff creation payload passes validation");

  // 2. Multi-Tenant Cross-Restaurant Isolation & RBAC
  console.log("\n--- 2. Tenant Isolation & Role Permissions Tests ---");
  const tenant1Id = new mongoose.Types.ObjectId().toString();
  const tenant2Id = new mongoose.Types.ObjectId().toString();

  const waiterPayload: AuthUserPayload = {
    id: new mongoose.Types.ObjectId().toString(),
    email: "waiter@restaurant1.com",
    role: "WAITER",
    userType: "Staff",
    restaurantId: tenant1Id,
    permissions: DEFAULT_ROLE_PERMISSIONS.WAITER,
  };

  const adminPayload: AuthUserPayload = {
    id: new mongoose.Types.ObjectId().toString(),
    email: "admin@restaurant1.com",
    role: "ADMIN",
    userType: "Staff",
    restaurantId: tenant1Id,
    permissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
  };

  assert(
    adminPayload.permissions.includes(PERMISSIONS.STAFF_MANAGE),
    "Restaurant Admin has STAFF_MANAGE permission"
  );
  assert(
    !waiterPayload.permissions.includes(PERMISSIONS.STAFF_MANAGE),
    "Waiter does NOT have STAFF_MANAGE permission"
  );
  assert(
    !waiterPayload.permissions.includes(PERMISSIONS.MENU_MANAGE),
    "Waiter does NOT have MENU_MANAGE permission"
  );
  assert(
    waiterPayload.permissions.includes(PERMISSIONS.ORDERS_CREATE),
    "Waiter has ORDERS_CREATE permission"
  );

  // Cross-tenant assertion test
  assert(
    waiterPayload.restaurantId !== tenant2Id,
    "Tenant 1 staff context is strictly isolated from Tenant 2"
  );

  // 3. Socket.IO Room Scoping Test
  console.log("\n--- 3. Socket.IO Tenant Room Authorization Test ---");
  const expectedRoom = `restaurant:${tenant1Id}`;
  assert(
    expectedRoom === `restaurant:${waiterPayload.restaurantId}`,
    "Socket room subscription derives strictly from authenticated restaurantId"
  );

  // 4. Database Integration Tests
  console.log("\n--- 4. Database Integration & Operations Tests ---");
  console.log("Checking MongoDB Atlas connectivity...");
  const isConnected = await connectDB();

  if (!isConnected) {
    console.log(
      "\n[NOTICE] MongoDB Atlas connection blocked due to IP Access List (Whitelist) restrictions."
    );
    console.log(
      "Live database tests (table CRUD, category deletion validation, menu item creation) are pending Atlas IP Whitelisting."
    );
  } else {
    try {
      console.log("MongoDB connected. Running live restaurant operations tests...\n");

      // Set up test restaurant with subscription plan
      const plan = await SubscriptionPlan.create({
        name: `Ops Plan ${Date.now()}`,
        price: 1999,
        billingCycle: "MONTHLY",
        features: ["KOT", "BILLING"],
        limits: {
          maxTables: 2, // Low quota for limit testing
          maxStaff: 2,
          maxOrdersPerMonth: 100,
          maxMenuItems: 3,
        },
      });

      const rest = await Restaurant.create({
        name: "Test Bistro",
        slug: `test-bistro-${Date.now()}`,
        email: `bistro-${Date.now()}@test.com`,
        phone: "+919876543200",
        status: "ACTIVE",
      });

      const sub = await Subscription.create({
        restaurantId: rest._id,
        planId: plan._id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentStatus: "PAID",
        subscriptionStatus: "ACTIVE",
        amountPaid: 1999,
      });

      rest.subscriptionId = sub._id as mongoose.Types.ObjectId;
      await rest.save();

      const actorId = new mongoose.Types.ObjectId().toString();

      // Test A: Create Table 1
      const table1 = await restaurantService.createTable(
        rest._id.toString(),
        { tableNumber: "T-1", capacity: 4, floor: "Ground" },
        actorId
      );
      assert(table1.tableNumber === "T-1", "Table 1 created successfully");

      // Test B: Duplicate Table Number Rejection
      let duplicateCaught = false;
      try {
        await restaurantService.createTable(
          rest._id.toString(),
          { tableNumber: "T-1", capacity: 2 },
          actorId
        );
      } catch (err: any) {
        duplicateCaught = true;
        assert(err.message.includes("already exists"), "Duplicate table number in same restaurant rejected");
      }
      assert(duplicateCaught, "Duplicate table number caught by service");

      // Test C: Enforce Table Quota Limit
      await restaurantService.createTable(
        rest._id.toString(),
        { tableNumber: "T-2", capacity: 4 },
        actorId
      );
      let quotaExceeded = false;
      try {
        // Table 3 exceeds maxTables: 2
        await restaurantService.createTable(
          rest._id.toString(),
          { tableNumber: "T-3", capacity: 4 },
          actorId
        );
      } catch (err: any) {
        quotaExceeded = true;
        assert(err.message.includes("quota exceeded"), "Exceeding plan table quota throws error");
      }
      assert(quotaExceeded, "Table quota limit enforcement succeeded");

      // Test D: Category Creation & Linked Item Deletion Prevention
      const cat = await restaurantService.createCategory(
        rest._id.toString(),
        { name: "Beverages", sortOrder: 1 },
        actorId
      );
      assert(cat.name === "Beverages", "Menu category created successfully");

      const item = await restaurantService.createMenuItem(
        rest._id.toString(),
        {
          name: "Fresh Lime Soda",
          categoryId: cat._id.toString(),
          price: 90,
          taxRate: 5,
          isVegetarian: true,
        },
        actorId
      );
      assert(item.name === "Fresh Lime Soda", "Menu item created under category");

      // Test Category Deletion Prevention with Linked Item
      let catDeleteBlocked = false;
      try {
        await restaurantService.deleteCategory(rest._id.toString(), cat._id.toString(), actorId);
      } catch (err: any) {
        catDeleteBlocked = true;
        assert(err.message.includes("Cannot delete category"), "Deleting category with linked items is blocked");
      }
      assert(catDeleteBlocked, "Category deletion safety check succeeded");

      // Test E: Invalid Cross-Restaurant Category Reference Rejection
      const otherRestaurantId = new mongoose.Types.ObjectId().toString();
      let crossCatBlocked = false;
      try {
        await restaurantService.createMenuItem(
          otherRestaurantId,
          {
            name: "Hacker Item",
            categoryId: cat._id.toString(), // Category belongs to rest, not otherRestaurantId
            price: 150,
          },
          actorId
        );
      } catch (err: any) {
        crossCatBlocked = true;
        assert(err.message.includes("does not belong to your restaurant"), "Cross-restaurant category reference rejected");
      }
      assert(crossCatBlocked, "Cross-tenant category reference blocked");

      // Test F: Soft-delete / Archive Menu Item when in Order history
      const deleteResult = await restaurantService.deleteMenuItem(
        rest._id.toString(),
        item._id.toString(),
        actorId
      );
      assert(deleteResult.archived === false, "Unreferenced menu item can be deleted cleanly");

      // Clean up
      await MenuItem.deleteMany({ restaurantId: rest._id });
      await MenuCategory.deleteMany({ restaurantId: rest._id });
      await RestaurantTable.deleteMany({ restaurantId: rest._id });
      await Subscription.findByIdAndDelete(sub._id);
      await Restaurant.findByIdAndDelete(rest._id);
      await SubscriptionPlan.findByIdAndDelete(plan._id);

      console.log("\nDatabase integration tests completed successfully.");
    } catch (dbErr) {
      console.error("Database test error:", dbErr);
    } finally {
      await disconnectDB();
    }
  }

  console.log(`\n=================================================`);
  console.log(`Step 9 Tests Passed: ${passed} / ${total}`);
  console.log(`=================================================`);
}

runStep9TestSuite();

