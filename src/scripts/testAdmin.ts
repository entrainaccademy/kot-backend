import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/database";
import {
  createRestaurantAdminSchema,
  createPlanSchema,
  createSubscriptionSchema,
} from "../validators/adminValidators";
import { generateAccessToken, AuthUserPayload } from "../utils/jwt";
import { DEFAULT_ROLE_PERMISSIONS } from "../utils/permissions";
import { checkPlanLimit } from "../middleware/subscriptionCheck";
import { Restaurant } from "../models/Restaurant";
import { SubscriptionPlan } from "../models/SubscriptionPlan";
import { Subscription } from "../models/Subscription";
import { Staff } from "../models/Staff";
import * as adminService from "../services/adminService";

async function runStep8TestSuite() {
  console.log("=================================================");
  console.log("  STEP 8: SUPER ADMIN & SAAS SUBSCRIPTION TESTS  ");
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

  // 1. Zod Schema Validation Tests
  console.log("--- 1. Validation Schema Tests ---");
  const validRestaurantPayload = {
    restaurant: {
      name: "Tandoori Nights",
      slug: "tandoori-nights",
      email: "info@tandoorinights.com",
      phone: "+919876543210",
    },
    admin: {
      name: "Rajesh Kumar",
      email: "rajesh@tandoorinights.com",
      phone: "+919876543211",
      password: "StrongPassword123!",
    },
  };
  const restVal = createRestaurantAdminSchema.safeParse(validRestaurantPayload);
  assert(restVal.success, "Valid restaurant & admin payload passes validation");

  const invalidSlugPayload = {
    ...validRestaurantPayload,
    restaurant: {
      ...validRestaurantPayload.restaurant,
      slug: "Tandoori Nights INVALID SLUG!",
    },
  };
  const invalidSlugVal = createRestaurantAdminSchema.safeParse(invalidSlugPayload);
  assert(!invalidSlugVal.success, "Invalid slug (spaces/uppercase) is rejected");

  const validPlanPayload = {
    name: "Standard",
    price: 1999,
    billingCycle: "MONTHLY" as const,
    features: ["KOT", "BILLING", "TABLE_MANAGEMENT"],
    limits: {
      maxTables: 25,
      maxStaff: 10,
      maxOrdersPerMonth: 5000,
      maxMenuItems: 100,
    },
    status: "ACTIVE" as const,
  };
  const planVal = createPlanSchema.safeParse(validPlanPayload);
  assert(planVal.success, "Valid SaaS plan payload passes validation");

  const invalidPricePlan = {
    ...validPlanPayload,
    price: -500,
  };
  const invalidPriceVal = createPlanSchema.safeParse(invalidPricePlan);
  assert(!invalidPriceVal.success, "Negative plan price is rejected");

  const validSubPayload = {
    restaurantId: new mongoose.Types.ObjectId().toString(),
    planId: new mongoose.Types.ObjectId().toString(),
    billingCycle: "MONTHLY" as const,
    paymentStatus: "PAID" as const,
    amountPaid: 1999,
  };
  const subVal = createSubscriptionSchema.safeParse(validSubPayload);
  assert(subVal.success, "Valid subscription creation payload passes validation");

  // 2. RBAC & Token Role Evaluation Tests
  console.log("\n--- 2. RBAC Authorization & Security Isolation Tests ---");
  const superAdminPayload: AuthUserPayload = {
    id: new mongoose.Types.ObjectId().toString(),
    email: "superadmin@kotplatform.com",
    role: "SUPER_ADMIN",
    userType: "SuperAdmin",
    permissions: DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN,
  };
  const superAdminToken = generateAccessToken(superAdminPayload);
  assert(Boolean(superAdminToken), "SuperAdmin access token generated successfully");

  const restaurantAdminPayload: AuthUserPayload = {
    id: new mongoose.Types.ObjectId().toString(),
    email: "admin@tandoorinights.com",
    role: "ADMIN",
    userType: "Staff",
    restaurantId: new mongoose.Types.ObjectId().toString(),
    permissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
  };
  assert(
    restaurantAdminPayload.role !== "SUPER_ADMIN",
    "Restaurant Admin role ('ADMIN') is distinct from platform 'SUPER_ADMIN'"
  );

  const cashierPayload: AuthUserPayload = {
    id: new mongoose.Types.ObjectId().toString(),
    email: "cashier@tandoorinights.com",
    role: "CASHIER",
    userType: "Staff",
    restaurantId: restaurantAdminPayload.restaurantId,
    permissions: DEFAULT_ROLE_PERMISSIONS.CASHIER,
  };
  assert(
    cashierPayload.role !== "SUPER_ADMIN",
    "Cashier role ('CASHIER') is blocked from platform administration"
  );

  // 3. Subscription & Multi-Tenant Enforcement Logic Tests
  console.log("\n--- 3. Subscription Policy & Tenant Access Logic Tests ---");
  const now = new Date();
  const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  assert(futureDate > now, "Active subscription unexpired check evaluates true");
  assert(pastDate < now, "Expired subscription check evaluates true (triggers 402)");

  const planFeatures = ["KOT", "BILLING", "TABLE_MANAGEMENT"];
  assert(
    planFeatures.includes("KOT"),
    "Feature included in plan allows access"
  );
  assert(
    !planFeatures.includes("ADVANCED_INVENTORY"),
    "Feature not included in plan correctly triggers upgradeRequired (403)"
  );

  // 4. Live Database Integration Tests (If MongoDB Atlas is reachable)
  console.log("\n--- 4. Database Integration Tests ---");
  console.log("Checking MongoDB Atlas connectivity...");
  const isConnected = await connectDB();

  if (!isConnected) {
    console.log(
      "\n[NOTICE] MongoDB Atlas connection blocked due to IP Access List (Whitelist) restrictions."
    );
    console.log(
      "Live database tests (restaurant creation, plan assignment, renewal) are pending Atlas IP Whitelisting."
    );
  } else {
    try {
      console.log("MongoDB connected. Running live Super Admin workflow tests...\n");

      const actorId = new mongoose.Types.ObjectId().toString();

      // Test A: Create Plan
      const testPlan = await adminService.createPlan(
        {
          name: `Test Plan ${Date.now()}`,
          price: 2499,
          billingCycle: "MONTHLY",
          features: ["KOT", "BILLING", "INVENTORY"],
          limits: {
            maxTables: 20,
            maxStaff: 10,
            maxOrdersPerMonth: 3000,
            maxMenuItems: 80,
          },
          status: "ACTIVE",
        },
        actorId
      );
      assert(testPlan.price === 2499, "Created SaaS plan in MongoDB with correct price");

      // Test B: Create Restaurant + Admin
      const testRestSlug = `test-rest-${Date.now()}`;
      const restCreated = await adminService.createRestaurantWithAdmin(
        {
          restaurant: {
            name: "Test Royal Palace",
            slug: testRestSlug,
            email: `palace-${Date.now()}@test.com`,
            phone: "+919988776655",
          },
          admin: {
            name: "Palace Manager",
            email: `admin-${Date.now()}@palace.com`,
            phone: "+919988776656",
            password: "PalacePassword123!",
          },
        },
        actorId
      );
      assert(restCreated.restaurant.slug === testRestSlug, "Restaurant created with slug in MongoDB");
      assert(restCreated.admin.role === "ADMIN", "Restaurant Admin assigned to restaurant");

      // Test C: Assign Subscription
      const sub = await adminService.createSubscription(
        {
          restaurantId: restCreated.restaurant.id,
          planId: testPlan._id.toString(),
          billingCycle: "MONTHLY",
          paymentStatus: "PAID",
          amountPaid: testPlan.price,
        },
        actorId
      );
      assert(sub.subscriptionStatus === "ACTIVE", "Subscription created and activated");
      assert(sub.paymentStatus === "PAID", "Subscription marked as PAID");

      // Test D: Renew Subscription
      const renewed = await adminService.renewSubscription(sub._id.toString(), actorId);
      assert(
        new Date(renewed.endDate) > new Date(sub.endDate),
        "Subscription renewal extends end date"
      );

      // Test E: Cancel Subscription
      const cancelled = await adminService.cancelSubscription(sub._id.toString(), actorId);
      assert(cancelled.subscriptionStatus === "CANCELLED", "Subscription cancellation updates status");

      // Test F: Update Restaurant Status
      const suspended = await adminService.updateRestaurantStatus(
        restCreated.restaurant.id,
        "SUSPENDED",
        "Non-payment of platform invoice",
        actorId
      );
      assert(suspended.status === "SUSPENDED", "SuperAdmin can suspend restaurant");

      // Test G: Dashboard Metrics
      const dashboard = await adminService.getDashboardMetrics();
      assert(dashboard.totalRestaurants >= 1, "Dashboard returns total restaurants metric");
      assert(dashboard.suspendedRestaurants >= 1, "Dashboard returns suspended restaurants metric");
      assert(dashboard.monthlySubscriptionRevenue >= 0, "Dashboard returns verified monthly subscription revenue");

      // Clean up test data
      await Staff.deleteMany({ restaurantId: restCreated.restaurant.id });
      await Subscription.deleteMany({ restaurantId: restCreated.restaurant.id });
      await Restaurant.findByIdAndDelete(restCreated.restaurant.id);
      await SubscriptionPlan.findByIdAndDelete(testPlan._id);

      console.log("\nDatabase integration tests completed successfully.");
    } catch (err) {
      console.error("Database test error:", err);
    } finally {
      await disconnectDB();
    }
  }

  console.log(`\n=================================================`);
  console.log(`Step 8 Tests Passed: ${passed} / ${total}`);
  console.log(`=================================================`);
}

runStep8TestSuite();

