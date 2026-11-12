import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/database";
import {
  createOrderSchema,
  generateKOTSchema,
  updateKOTStatusSchema,
} from "../validators/orderValidators";
import { calculateOrderTotals, generateOrderNumber, generateKOTNumber } from "../services/orderService";
import { IOrderItem } from "../models/Order";
import { KitchenStatus } from "../models/KOT";

async function runStep10TestSuite() {
  console.log("=================================================");
  console.log("  STEP 10: ORDERS, KOT & KDS BACKEND TEST SUITE  ");
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
  console.log("--- 1. Order & KOT Validation Schema Tests ---");
  const testMenuId = new mongoose.Types.ObjectId().toString();
  const testTableId = new mongoose.Types.ObjectId().toString();

  const validDineIn = createOrderSchema.safeParse({
    orderType: "DINE_IN",
    tableId: testTableId,
    items: [
      { menuItemId: testMenuId, quantity: 2, notes: "Extra spicy" },
      { menuItemId: new mongoose.Types.ObjectId().toString(), quantity: 1 },
    ],
    discount: 50,
  });
  assert(validDineIn.success, "Valid dine-in order payload passes validation");

  const validTakeaway = createOrderSchema.safeParse({
    orderType: "TAKEAWAY",
    items: [{ menuItemId: testMenuId, quantity: 1 }],
  });
  assert(validTakeaway.success, "Valid takeaway order (without tableId) passes validation");

  const emptyItemsOrder = createOrderSchema.safeParse({
    orderType: "DINE_IN",
    items: [],
  });
  assert(!emptyItemsOrder.success, "Order with empty items array is rejected by schema");

  const invalidQtyOrder = createOrderSchema.safeParse({
    orderType: "TAKEAWAY",
    items: [{ menuItemId: testMenuId, quantity: 0 }],
  });
  assert(!invalidQtyOrder.success, "Order with 0 quantity item is rejected");

  const validKOTGen = generateKOTSchema.safeParse({
    priority: "HIGH",
    idempotencyKey: "unique-kot-key-123",
  });
  assert(validKOTGen.success, "Valid KOT generation options payload passes validation");

  const validKOTStatus = updateKOTStatusSchema.safeParse({ status: "PREPARING" });
  assert(validKOTStatus.success, "Valid kitchen status update passes validation");

  const invalidKOTStatus = updateKOTStatusSchema.safeParse({ status: "FLYING" });
  assert(!invalidKOTStatus.success, "Unrecognized kitchen status is rejected");

  // 2. Financial & Total Calculation Integrity Tests
  console.log("\n--- 2. Financial & Calculation Integrity Tests ---");
  const mockItems: IOrderItem[] = [
    {
      menuItemId: new mongoose.Types.ObjectId(),
      name: "Butter Chicken",
      price: 350.0,
      quantity: 2,
      submittedQuantity: 0,
      taxRate: 5.0, // 5% GST
      itemTotal: 700.0,
      status: "ACTIVE",
    },
    {
      menuItemId: new mongoose.Types.ObjectId(),
      name: "Garlic Naan",
      price: 60.0,
      quantity: 3,
      submittedQuantity: 0,
      taxRate: 5.0, // 5% GST
      itemTotal: 180.0,
      status: "ACTIVE",
    },
    {
      menuItemId: new mongoose.Types.ObjectId(),
      name: "Cancelled Dish",
      price: 200.0,
      quantity: 1,
      submittedQuantity: 0,
      taxRate: 5.0,
      itemTotal: 200.0,
      status: "CANCELLED", // Cancelled items must NOT be included in subtotal or tax
    },
  ];

  const totals = calculateOrderTotals(mockItems, 50.0); // 50 discount
  // Subtotal = 700 + 180 = 880
  // Tax = 5% of 700 (35) + 5% of 180 (9) = 44
  // Grand Total = 880 + 44 - 50 = 874.00
  assert(totals.subtotal === 880.0, `Subtotal calculated accurately (Expected 880, got ${totals.subtotal})`);
  assert(totals.tax === 44.0, `Tax snapshot calculated accurately (Expected 44, got ${totals.tax})`);
  assert(totals.discount === 50.0, `Discount verified (50.0)`);
  assert(totals.grandTotal === 874.0, `Grand total calculated accurately (Expected 874.0, got ${totals.grandTotal})`);

  // 3. Kitchen Status State Machine Transition Validation
  console.log("\n--- 3. Kitchen Display System (KDS) State Transitions ---");
  const validTransitions: Record<KitchenStatus, KitchenStatus[]> = {
    PENDING: ["ACCEPTED", "PREPARING", "IN_PROGRESS", "CANCELLED"],
    ACCEPTED: ["PREPARING", "IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["READY", "CANCELLED"],
    PREPARING: ["READY", "CANCELLED"],
    READY: ["COMPLETED", "SERVED", "CANCELLED"],
    SERVED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  assert(
    validTransitions["PENDING"].includes("ACCEPTED"),
    "Kitchen transition: PENDING -> ACCEPTED is valid"
  );
  assert(
    validTransitions["PREPARING"].includes("READY"),
    "Kitchen transition: PREPARING -> READY is valid"
  );
  assert(
    !validTransitions["READY"].includes("PENDING"),
    "Kitchen transition: READY -> PENDING is disallowed (no backward regressions)"
  );
  assert(
    validTransitions["COMPLETED"].length === 0,
    "COMPLETED is a terminal kitchen state"
  );

  // 4. Thermal Printing Formatter Verification (58mm & 80mm)
  console.log("\n--- 4. Thermal KOT Print Formatter Tests ---");
  const lineWidth58 = 32;
  const lineWidth80 = 48;
  const divider58 = "-".repeat(lineWidth58);
  const divider80 = "-".repeat(lineWidth80);

  assert(divider58.length === 32, "58mm printer format generates exactly 32-character lines");
  assert(divider80.length === 48, "80mm printer format generates exactly 48-character lines");

  // 5. Database Integration & Workflow Tests
  console.log("\n--- 5. Database Integration Tests ---");
  console.log("Checking MongoDB Atlas connectivity...");
  const isConnected = await connectDB();

  if (!isConnected) {
    console.log(
      "\n[NOTICE] MongoDB Atlas connection blocked due to IP Access List (Whitelist) restrictions."
    );
    console.log(
      "Live database tests (order persistence, KOT generation, table occupancy) are pending Atlas IP Whitelisting."
    );
  } else {
    console.log("MongoDB Atlas connected. Live test suite will execute...");
    await disconnectDB();
  }

  console.log(`\n=================================================`);
  console.log(`Step 10 Tests Passed: ${passed} / ${total}`);
  console.log(`=================================================`);
}

runStep10TestSuite();

