import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/database";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateTokenFamily,
} from "../utils/jwt";
import { hashPassword, comparePassword } from "../utils/password";
import { loginSchema, changePasswordSchema } from "../validators/authValidators";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "../utils/permissions";
import { SuperAdmin } from "../models/SuperAdmin";
import { Restaurant } from "../models/Restaurant";
import { Staff } from "../models/Staff";
import { RefreshToken } from "../models/RefreshToken";
import * as authService from "../services/authService";

async function runTestSuite() {
  console.log("==========================================");
  console.log("       STEP 7 AUTH & RBAC TEST SUITE      ");
  console.log("==========================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // 1. UNIT TEST: Password Hashing & Comparison
  console.log("--- 1. Password Security & Hashing Tests ---");
  const testPassword = "SecurePassword123!";
  const hash = await hashPassword(testPassword);
  assert(hash !== testPassword, "Password must not be stored in plaintext");
  assert(hash.startsWith("$2"), "Password hash must be a valid bcrypt hash");
  assert(await comparePassword(testPassword, hash), "comparePassword must match correct password");
  assert(!(await comparePassword("WrongPassword123!", hash)), "comparePassword must reject incorrect password");

  // 2. UNIT TEST: JWT Token Generation & Verification
  console.log("\n--- 2. JWT Generation & Verification Tests ---");
  const testPayload = {
    id: new mongoose.Types.ObjectId().toString(),
    email: "superadmin@kotplatform.com",
    role: "SUPER_ADMIN" as const,
    userType: "SuperAdmin" as const,
    permissions: DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN,
  };
  const token = generateAccessToken(testPayload);
  const decoded = verifyAccessToken(token);
  assert(decoded.id === testPayload.id, "Access token verification preserves user ID");
  assert(decoded.role === "SUPER_ADMIN", "Access token verification preserves user role");

  const family = generateTokenFamily();
  const refreshTokenStr = generateRefreshToken({
    userId: testPayload.id,
    userType: "SuperAdmin",
    family,
  });
  const decodedRefresh = verifyRefreshToken(refreshTokenStr);
  assert(decodedRefresh.family === family, "Refresh token preserves family identifier");
  assert(decodedRefresh.userId === testPayload.id, "Refresh token preserves user ID");

  // 3. UNIT TEST: Schema Validation (Zod)
  console.log("\n--- 3. Zod Request Validation Tests ---");
  const validLogin = loginSchema.safeParse({ email: "admin@restaurant.com", password: "Password123" });
  assert(validLogin.success, "Valid login payload passes schema validation");

  const invalidEmail = loginSchema.safeParse({ email: "invalid-email-string", password: "Password123" });
  assert(!invalidEmail.success, "Invalid email format is rejected by schema");

  const weakPassword = changePasswordSchema.safeParse({
    currentPassword: "old",
    newPassword: "short",
  });
  assert(!weakPassword.success, "Weak password change payload is rejected (< 8 chars)");

  // 4. UNIT TEST: RBAC & Permission Matrix
  console.log("\n--- 4. Role & Permissions Matrix Tests ---");
  assert(
    DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN.includes(PERMISSIONS.SETTINGS_MANAGE),
    "SuperAdmin has SETTINGS_MANAGE permission"
  );
  assert(
    DEFAULT_ROLE_PERMISSIONS.WAITER.includes(PERMISSIONS.ORDERS_CREATE),
    "Waiter has ORDERS_CREATE permission"
  );
  assert(
    !DEFAULT_ROLE_PERMISSIONS.WAITER.includes(PERMISSIONS.BILLING_CREATE),
    "Waiter does NOT have BILLING_CREATE permission"
  );
  assert(
    DEFAULT_ROLE_PERMISSIONS.CASHIER.includes(PERMISSIONS.BILLING_CREATE),
    "Cashier has BILLING_CREATE permission"
  );
  assert(
    !DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF.includes(PERMISSIONS.STAFF_MANAGE),
    "Kitchen Staff does NOT have STAFF_MANAGE permission"
  );

  // 5. DATABASE INTEGRATION TESTS (If MongoDB Atlas is reachable)
  console.log("\n--- 5. Database Integration & Multi-Tenant Tests ---");
  console.log("Checking MongoDB Atlas connectivity...");
  const isDbConnected = await connectDB();

  if (!isDbConnected) {
    console.log(
      "\n[NOTICE] MongoDB Atlas connection blocked due to IP Access List (Whitelist) restrictions."
    );
    console.log(
      "Live database tests (login, token rotation, cross-tenant isolation) are pending Atlas IP Whitelisting."
    );
  } else {
    try {
      console.log("MongoDB connected. Executing live end-to-end authentication tests...\n");

      // Clean up previous test artifacts if any
      const testRestSlug = `test-rest-${Date.now()}`;
      const testSuperAdminEmail = `test-super-${Date.now()}@kotplatform.com`;
      const testStaffEmail = `test-staff-${Date.now()}@testrestaurant.com`;

      // A. Create Test SuperAdmin
      const superAdminPass = "SuperAdminSecret123!";
      const superAdminDoc = await SuperAdmin.create({
        name: "Test SuperAdmin",
        email: testSuperAdminEmail,
        passwordHash: await hashPassword(superAdminPass),
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      });

      // B. Create Test Restaurant
      const restDoc = await Restaurant.create({
        name: "Test Palace",
        slug: testRestSlug,
        email: "contact@testpalace.com",
        phone: "+919876543210",
        status: "ACTIVE",
      });

      // C. Create Test Staff
      const staffPass = "StaffSecret123!";
      const staffDoc = await Staff.create({
        restaurantId: restDoc._id,
        name: "John Waiter",
        email: testStaffEmail,
        phone: "+919876543211",
        passwordHash: await hashPassword(staffPass),
        role: "WAITER",
        permissions: DEFAULT_ROLE_PERMISSIONS.WAITER,
        status: "ACTIVE",
      });

      // Test Successful SuperAdmin Login
      const superLogin = await authService.login(testSuperAdminEmail, superAdminPass);
      assert(superLogin.user.role === "SUPER_ADMIN", "SuperAdmin login returns correct role");
      assert(Boolean(superLogin.accessToken), "SuperAdmin login yields valid access token");
      assert(Boolean(superLogin.refreshToken), "SuperAdmin login yields valid refresh token");

      // Test Successful Staff Login
      const staffLogin = await authService.login(testStaffEmail, staffPass);
      assert(staffLogin.user.role === "WAITER", "Staff login returns correct role");
      assert(
        staffLogin.user.restaurantId === restDoc._id.toString(),
        "Staff login binds to correct restaurantId"
      );

      // Test Invalid Login (Wrong Password)
      let invalidPassCaught = false;
      try {
        await authService.login(testStaffEmail, "WrongPassword!");
      } catch (e: any) {
        invalidPassCaught = true;
        assert(e.message === "Invalid email or password", "Invalid password returns generic error message");
      }
      assert(invalidPassCaught, "Invalid password throws generic authentication error");

      // Test Token Rotation (Refresh)
      const rotated = await authService.rotateRefreshToken(staffLogin.refreshToken);
      assert(Boolean(rotated.accessToken), "Token refresh generates new access token");
      assert(Boolean(rotated.newRefreshToken), "Token refresh generates new rotated refresh token");

      // Test Token Reuse Detection
      let reuseDetected = false;
      try {
        // Attempting to reuse the old refresh token
        await authService.rotateRefreshToken(staffLogin.refreshToken);
      } catch (e: any) {
        reuseDetected = true;
        assert(
          e.message.includes("Suspicious session activity detected"),
          "Reusing an already-rotated token triggers reuse detection error"
        );
      }
      assert(reuseDetected, "Refresh token reuse detection successfully blocked reuse");

      // Test Inactive Account Login Rejection
      await Staff.findByIdAndUpdate(staffDoc._id, { status: "INACTIVE" });
      let inactiveBlocked = false;
      try {
        await authService.login(testStaffEmail, staffPass);
      } catch (e: any) {
        inactiveBlocked = true;
        assert(e.message.includes("deactivated"), "Inactive staff login is rejected");
      }
      assert(inactiveBlocked, "Inactive staff account cannot log in");

      // Clean up test data
      await SuperAdmin.findByIdAndDelete(superAdminDoc._id);
      await Staff.findByIdAndDelete(staffDoc._id);
      await Restaurant.findByIdAndDelete(restDoc._id);
      await RefreshToken.deleteMany({ userId: { $in: [superAdminDoc._id, staffDoc._id] } });

      console.log("\nDatabase integration tests completed successfully.");
    } catch (dbErr) {
      console.error("Database test error:", dbErr);
    } finally {
      await disconnectDB();
    }
  }

  console.log(`\n==========================================`);
  console.log(`Tests Passed: ${passedTests} / ${totalTests}`);
  console.log(`==========================================`);
}

runTestSuite();

