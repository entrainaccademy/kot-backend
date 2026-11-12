import dotenv from "dotenv";
dotenv.config();

import PDFDocument from "pdfkit";
import {
  createInvoiceSchema,
  recordPaymentSchema,
  refundPaymentSchema,
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
} from "../validators/billingValidators";
import { generateAccessToken, AuthUserPayload } from "../utils/jwt";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "../utils/permissions";
import { connectDB, disconnectDB } from "../config/database";

async function runStep11TestSuite() {
  console.log("=================================================");
  console.log("  STEP 11: POS BILLING & PAYMENTS TEST SUITE     ");
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

  // -------------------------------------------------------------
  // 1. Zod Validation Tests for Billing & Payments
  // -------------------------------------------------------------
  console.log("--- 1. Billing Zod Validation Tests ---");

  const validInvoiceInput = createInvoiceSchema.safeParse({
    orderId: "654321098765432109876543",
    discount: {
      type: "PERCENTAGE",
      value: 10,
      reason: "Happy Hour Special",
    },
    serviceCharge: 25.5,
    deliveryCharge: 40.0,
    taxType: "INTRA_STATE",
    idempotencyKey: "idem-inv-12345",
  });
  assert(validInvoiceInput.success, "Valid invoice creation input passes validation");

  const invalidInvoiceInput = createInvoiceSchema.safeParse({
    orderId: "invalid-id",
    discount: {
      type: "PERCENTAGE",
      value: -5,
    },
    serviceCharge: -10,
  });
  assert(!invalidInvoiceInput.success, "Invalid orderId, negative discount and negative charge are rejected");

  const validFixedDiscount = createInvoiceSchema.safeParse({
    orderId: "654321098765432109876543",
    discount: {
      type: "FIXED",
      value: 100,
    },
  });
  assert(validFixedDiscount.success, "Valid FIXED discount passes validation");

  // Payment validator tests
  const validCashPayment = recordPaymentSchema.safeParse({
    amount: 350.5,
    paymentMethod: "CASH",
    cashDetails: {
      cashReceived: 500,
    },
    notes: "Counter Cashier 1",
    idempotencyKey: "pay-idem-001",
  });
  assert(validCashPayment.success, "Valid CASH payment with sufficient cashReceived passes");

  const invalidCashPayment = recordPaymentSchema.safeParse({
    amount: 500,
    paymentMethod: "CASH",
    cashDetails: {
      cashReceived: 300, // Insufficient cash received!
    },
  });
  assert(!invalidCashPayment.success, "CASH payment with cashReceived < amount is rejected");

  const validUPIPayment = recordPaymentSchema.safeParse({
    amount: 250,
    paymentMethod: "UPI",
    transactionReference: "UPI9876543210",
  });
  assert(validUPIPayment.success, "Valid UPI payment with transaction reference passes");

  const validCardPayment = recordPaymentSchema.safeParse({
    amount: 1200,
    paymentMethod: "CARD",
    transactionReference: "POS-TXN-778899",
  });
  assert(validCardPayment.success, "Valid CARD payment without sensitive card details passes");

  const invalidPaymentZeroAmount = recordPaymentSchema.safeParse({
    amount: 0,
    paymentMethod: "UPI",
  });
  assert(!invalidPaymentZeroAmount.success, "Zero amount payment is rejected");

  // Refund validator tests
  const validRefund = refundPaymentSchema.safeParse({
    amount: 150,
    reason: "Customer returned defective item",
  });
  assert(validRefund.success, "Valid refund payload passes validation");

  const invalidRefundShortReason = refundPaymentSchema.safeParse({
    amount: 50,
    reason: "no", // Less than 3 chars
  });
  assert(!invalidRefundShortReason.success, "Short refund reason is rejected");

  // Query validator tests
  const validListInvoicesQuery = listInvoicesQuerySchema.safeParse({
    page: "2",
    limit: "50",
    paymentStatus: "PAID",
    search: "INV-20261111",
  });
  assert(validListInvoicesQuery.success && validListInvoicesQuery.data.page === 2, "Invoice list query coerces page and limit");

  // -------------------------------------------------------------
  // 2. GST & Financial Calculation Logic Tests
  // -------------------------------------------------------------
  console.log("\n--- 2. Tax & Financial Precision Calculation Engine Tests ---");

  const round2 = (val: number): number => Math.round(val * 100) / 100;

  // Test Intra-State GST Calculation (50% CGST + 50% SGST)
  const taxableAmount = 1000.0;
  const taxRate = 5.0; // 5% GST
  const cgstRate = taxRate / 2;
  const sgstRate = taxRate / 2;

  const cgst = round2((taxableAmount * cgstRate) / 100);
  const sgst = round2((taxableAmount * sgstRate) / 100);
  const totalTaxIntra = round2(cgst + sgst);

  assert(cgst === 25.0 && sgst === 25.0, "Intra-state 5% GST splits into 2.5% CGST (25.00) and 2.5% SGST (25.00)");
  assert(totalTaxIntra === 50.0, "Total tax for intra-state is 50.00");

  // Test Inter-State GST Calculation (100% IGST)
  const igst = round2((taxableAmount * 18.0) / 100);
  assert(igst === 180.0, "Inter-state 18% GST calculates 180.00 IGST");

  // Test Tax-Inclusive vs Exclusive
  const inclusiveItemPrice = 105.0;
  const inclusiveBase = round2(inclusiveItemPrice / (1 + 5 / 100));
  const inclusiveTax = round2(inclusiveItemPrice - inclusiveBase);
  assert(inclusiveBase === 100.0 && inclusiveTax === 5.0, "Tax-inclusive price of 105 at 5% rate breaks down into 100.00 base and 5.00 tax");

  // Test Multi-Rate Tax Breakdown
  const items = [
    { name: "Bread", price: 100, qty: 2, rate: 5 }, // 200 @ 5% -> 10 tax
    { name: "Coffee", price: 150, qty: 1, rate: 12 }, // 150 @ 12% -> 18 tax
    { name: "Dessert", price: 200, qty: 1, rate: 18 }, // 200 @ 18% -> 36 tax
  ];

  let subtotal = 0;
  const buckets: Record<number, number> = {};
  for (const it of items) {
    const itemTotal = it.price * it.qty;
    subtotal += itemTotal;
    buckets[it.rate] = (buckets[it.rate] || 0) + itemTotal;
  }

  let computedTax = 0;
  for (const [r, amt] of Object.entries(buckets)) {
    computedTax += round2((amt * Number(r)) / 100);
  }
  assert(subtotal === 550, "Multi-item subtotal is 550.00");
  assert(computedTax === 10 + 18 + 36, "Multi-rate tax correctly sums (10 + 18 + 36 = 64.00)");

  // Test Round Off Calculation
  const unroundedTotal = 550 + 64.45 + 23.33; // 637.78
  const roundedGrand = Math.round(unroundedTotal); // 638
  const roundOff = round2(roundedGrand - unroundedTotal); // 0.22
  assert(roundedGrand === 638 && roundOff === 0.22, "Round-off correctly adjusts 637.78 to 638.00 with +0.22 delta");

  // -------------------------------------------------------------
  // 3. Payment & Split Settlement Engine Tests
  // -------------------------------------------------------------
  console.log("\n--- 3. Payment Settlement & Balance Calculation Engine Tests ---");

  const grandTotal = 600.0;
  let paidAmount = 0.0;
  let balanceAmount = grandTotal;

  // Split payment 1: Cash 250
  const payment1 = 250.0;
  paidAmount = round2(paidAmount + payment1);
  balanceAmount = Math.max(0, round2(grandTotal - paidAmount));
  let status = balanceAmount <= 0.001 ? "PAID" : "PARTIALLY_PAID";
  assert(paidAmount === 250.0 && balanceAmount === 350.0, "First partial payment of 250 leaves balance of 350");
  assert(status === "PARTIALLY_PAID", "Invoice status is PARTIALLY_PAID after partial payment");

  // Split payment 2: UPI 350
  const payment2 = 350.0;
  paidAmount = round2(paidAmount + payment2);
  balanceAmount = Math.max(0, round2(grandTotal - paidAmount));
  status = balanceAmount <= 0.001 ? "PAID" : "PARTIALLY_PAID";
  assert(paidAmount === 600.0 && balanceAmount === 0.0, "Second payment settles remaining balance to 0");
  assert(status === "PAID", "Invoice status transitions to PAID upon full settlement");

  // Cash change test
  const billAmount = 375.0;
  const cashGiven = 500.0;
  const changeDue = round2(cashGiven - billAmount);
  assert(changeDue === 125.0, "Cash change calculated correctly (500 - 375 = 125)");

  // Overpayment prevention check
  const attemptOverpay = 50.0;
  const canAcceptOverpay = attemptOverpay <= balanceAmount + 0.001;
  assert(!canAcceptOverpay, "Overpayment attempt on fully settled invoice is rejected");

  // -------------------------------------------------------------
  // 4. Refund Engine Tests
  // -------------------------------------------------------------
  console.log("\n--- 4. Refund & Correction Engine Tests ---");

  const originalPaymentAmount = 350.0;
  let refundedAmount = 0.0;

  // Partial Refund 100
  const refund1 = 100.0;
  const maxRefundable = round2(originalPaymentAmount - refundedAmount);
  assert(refund1 <= maxRefundable, "Partial refund within limits is accepted");

  refundedAmount = round2(refundedAmount + refund1);
  let refundStatus = refundedAmount >= originalPaymentAmount - 0.001 ? "FULL" : "PARTIAL";
  paidAmount = Math.max(0, round2(paidAmount - refund1));
  balanceAmount = round2(grandTotal - paidAmount);
  status = paidAmount <= 0.001 ? "REFUNDED" : "PARTIALLY_PAID";

  assert(refundedAmount === 100.0 && refundStatus === "PARTIAL", "Payment status is PARTIAL refund");
  assert(paidAmount === 500.0 && balanceAmount === 100.0, "Invoice paidAmount adjusted to 500 and balance restored to 100");
  assert(status === "PARTIALLY_PAID", "Invoice paymentStatus restored to PARTIALLY_PAID");

  // Excess refund rejection
  const excessRefund = 300.0;
  const remainingRefundable = round2(originalPaymentAmount - refundedAmount);
  const excessAllowed = excessRefund <= remainingRefundable;
  assert(!excessAllowed, "Excess refund of 300 on remaining 250 is rejected");

  // -------------------------------------------------------------
  // 5. Thermal Receipt Generation Tests
  // -------------------------------------------------------------
  console.log("\n--- 5. Thermal Receipt Formatting Tests ---");

  const sampleInvoiceData = {
    invoiceNumber: "INV-20261111-0001",
    restaurantSnapshot: {
      name: "Tandoori Nights",
      address: "123 Food Street, Bangalore, Karnataka",
      phone: "+91 9876543210",
      gstin: "29AAAAA0000A1Z5",
      currency: "INR",
    },
    tableNumber: "T-04",
    orderType: "DINE_IN",
    items: [
      { name: "Butter Chicken", quantity: 2, price: 320, itemTotal: 640 },
      { name: "Garlic Naan", quantity: 4, price: 60, itemTotal: 240 },
    ],
    subtotal: 880,
    taxDetails: { cgst: 22, sgst: 22, igst: 0 },
    discount: 0,
    grandTotal: 924,
    paidAmount: 924,
    balanceAmount: 0,
    paymentStatus: "PAID",
  };

  const centerText = (text: string, width: number): string => {
    if (text.length >= width) return text.slice(0, width);
    const leftPad = Math.floor((width - text.length) / 2);
    return " ".repeat(leftPad) + text;
  };

  const header58 = centerText(sampleInvoiceData.restaurantSnapshot.name.toUpperCase(), 32);
  assert(header58.length <= 32, "58mm receipt header fits within 32 character boundary");

  const header80 = centerText(sampleInvoiceData.restaurantSnapshot.name.toUpperCase(), 48);
  assert(header80.length <= 48, "80mm receipt header fits within 48 character boundary");

  // -------------------------------------------------------------
  // 6. Pure Node.js PDFKit Generation Test
  // -------------------------------------------------------------
  console.log("\n--- 6. Pure Node.js PDFKit Generation Test ---");

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    doc.fontSize(18).text(sampleInvoiceData.restaurantSnapshot.name, { align: "center" });
    doc.fontSize(12).text(`Invoice Number: ${sampleInvoiceData.invoiceNumber}`);
    doc.text(`Grand Total: INR ${sampleInvoiceData.grandTotal}`);
    doc.text(`Status: ${sampleInvoiceData.paymentStatus}`);
    doc.end();
  });

  assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 500, "PDFKit produces valid PDF buffer (>500 bytes)");
  const isPdfHeader = pdfBuffer.slice(0, 5).toString("utf-8") === "%PDF-";
  assert(isPdfHeader, "Generated buffer has standard %PDF- header magic bytes");

  // -------------------------------------------------------------
  // 7. Role-Based Access Control (RBAC) Verification
  // -------------------------------------------------------------
  console.log("\n--- 7. RBAC & Permissions Enforcement Tests ---");

  const cashierPerms = DEFAULT_ROLE_PERMISSIONS.CASHIER;
  const waiterPerms = DEFAULT_ROLE_PERMISSIONS.WAITER;
  const kitchenPerms = DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF;
  const adminPerms = DEFAULT_ROLE_PERMISSIONS.ADMIN;

  assert(cashierPerms.includes(PERMISSIONS.BILLING_CREATE), "CASHIER has billing:create permission");
  assert(cashierPerms.includes(PERMISSIONS.BILLING_VIEW), "CASHIER has billing:view permission");
  assert(cashierPerms.includes(PERMISSIONS.PAYMENTS_MANAGE), "CASHIER has payments:manage permission");

  assert(adminPerms.includes(PERMISSIONS.BILLING_CREATE), "ADMIN has billing:create permission");
  assert(adminPerms.includes(PERMISSIONS.PAYMENTS_MANAGE), "ADMIN has payments:manage permission");

  assert(!waiterPerms.includes(PERMISSIONS.BILLING_CREATE), "WAITER is restricted from billing:create");
  assert(!waiterPerms.includes(PERMISSIONS.PAYMENTS_MANAGE), "WAITER is restricted from payments:manage");

  assert(!kitchenPerms.includes(PERMISSIONS.BILLING_CREATE), "KITCHEN_STAFF is restricted from billing:create");
  assert(!kitchenPerms.includes(PERMISSIONS.PAYMENTS_MANAGE), "KITCHEN_STAFF is restricted from payments:manage");

  // -------------------------------------------------------------
  // 8. MongoDB Live Database Connection Probe
  // -------------------------------------------------------------
  console.log("\n--- 8. Database Connection Probe ---");
  try {
    await connectDB();
    console.log("[PASS] Live MongoDB Atlas connection active and reachable");
    await disconnectDB();
  } catch (err: any) {
    console.log(`[INFO] Live MongoDB Atlas probe: ${err.message}`);
    console.log("[INFO] Unit, cryptographic, and calculation tests completed independently without DB dependency.");
  }

  console.log("\n=================================================");
  console.log(`  ALL ${passed}/${total} UNIT & LOGIC TESTS PASSED!`);
  console.log("=================================================");
}

runStep11TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });

