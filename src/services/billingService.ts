import { Types } from "mongoose";
import PDFDocument from "pdfkit";
import {
  Invoice,
  IInvoice,
  Payment,
  IPayment,
  Order,
  Restaurant,
  RestaurantTable,
  Customer,
} from "../models";
import {
  CreateInvoiceInput,
  RecordPaymentInput,
  RefundPaymentInput,
} from "../validators/billingValidators";
import { logSecurityEvent } from "./auditService";
import { emitToRestaurant } from "./socketService";

export interface ListInvoicesQuery {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  orderId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface ListPaymentsQuery {
  page?: number;
  limit?: number;
  paymentStatus?: string;
  paymentMethod?: string;
  invoiceId?: string;
  startDate?: string;
  endDate?: string;
}

const round2 = (val: number): number => Math.round(val * 100) / 100;

export const createInvoice = async (
  restaurantId: string,
  input: CreateInvoiceInput,
  staffId: string
): Promise<IInvoice> => {
  const restObjectId = new Types.ObjectId(restaurantId);

  // 1. Idempotency Check
  if (input.idempotencyKey) {
    const existingByIdempotency = await Invoice.findOne({
      restaurantId: restObjectId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existingByIdempotency) {
      return existingByIdempotency;
    }
  }

  // 2. Validate Order
  const order = await Order.findOne({
    _id: new Types.ObjectId(input.orderId),
    restaurantId: restObjectId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.status === "CANCELLED") {
    throw new Error("Cannot issue invoice for a cancelled order");
  }

  // 3. Prevent duplicate active invoices for the same order
  const existingActiveInvoice = await Invoice.findOne({
    restaurantId: restObjectId,
    orderId: order._id,
    status: { $ne: "VOID" },
  });

  if (existingActiveInvoice) {
    throw new Error(
      `An active invoice (${existingActiveInvoice.invoiceNumber}) has already been issued for this order`
    );
  }

  // 4. Retrieve Restaurant profile for tax and contact snapshot
  const restaurant = await Restaurant.findById(restObjectId);
  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const activeItems = order.items.filter((item) => item.status === "ACTIVE");
  if (activeItems.length === 0) {
    throw new Error("Order contains no active items to bill");
  }

  // 5. Generate Sequential Invoice Number (INV-YYYYMMDD-XXXX)
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const countToday = await Invoice.countDocuments({
    restaurantId: restObjectId,
    createdAt: { $gte: startOfDay },
  });

  let seqNum = countToday + 1;
  let invoiceNumber = `INV-${dateStr}-${String(seqNum).padStart(4, "0")}`;

  // Fallback for race condition safety
  while (
    await Invoice.findOne({
      restaurantId: restObjectId,
      invoiceNumber,
    })
  ) {
    seqNum += 1;
    invoiceNumber = `INV-${dateStr}-${String(seqNum).padStart(4, "0")}`;
  }

  // 6. Tax and Subtotal Calculation
  const isTaxInclusive = restaurant.taxSettings?.isTaxInclusive || false;
  const taxType = input.taxType || "INTRA_STATE";
  const defaultTaxRate = restaurant.taxSettings?.defaultTaxRate ?? 5;

  let calculatedSubtotal = 0;
  const invoiceItems = [];
  const taxRateBuckets: Record<number, number> = {};

  for (const item of activeItems) {
    const rate = typeof item.taxRate === "number" ? item.taxRate : defaultTaxRate;
    let basePrice = 0;

    if (isTaxInclusive) {
      // price includes tax
      const unitBase = item.price / (1 + rate / 100);
      basePrice = round2(unitBase * item.quantity);
      calculatedSubtotal += basePrice;
      taxRateBuckets[rate] = (taxRateBuckets[rate] || 0) + basePrice;
    } else {
      // price is exclusive of tax
      basePrice = round2(item.price * item.quantity);
      calculatedSubtotal += basePrice;
      taxRateBuckets[rate] = (taxRateBuckets[rate] || 0) + basePrice;
    }

    invoiceItems.push({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      taxRate: rate,
      itemTotal: item.itemTotal,
      discount: 0,
    });
  }

  calculatedSubtotal = round2(calculatedSubtotal);

  // 7. Calculate Tax Breakdown (CGST, SGST, IGST)
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  const breakdown = [];

  for (const [rateKey, taxableAmountRaw] of Object.entries(taxRateBuckets)) {
    const rate = Number(rateKey);
    const taxableAmount = round2(taxableAmountRaw);
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (taxType === "INTRA_STATE") {
      const halfRate = rate / 2;
      cgst = round2((taxableAmount * halfRate) / 100);
      sgst = round2((taxableAmount * halfRate) / 100);
      totalCgst += cgst;
      totalSgst += sgst;
    } else {
      igst = round2((taxableAmount * rate) / 100);
      totalIgst += igst;
    }

    breakdown.push({
      rate,
      taxableAmount,
      cgst,
      sgst,
      igst,
    });
  }

  totalCgst = round2(totalCgst);
  totalSgst = round2(totalSgst);
  totalIgst = round2(totalIgst);
  const totalTax = round2(totalCgst + totalSgst + totalIgst);

  // 8. Calculate Discount
  let discountAmount = 0;
  let discountDetails;
  if (input.discount) {
    if (input.discount.type === "PERCENTAGE") {
      discountAmount = round2((calculatedSubtotal * input.discount.value) / 100);
    } else {
      discountAmount = round2(input.discount.value);
    }
    discountAmount = Math.min(discountAmount, calculatedSubtotal);
    discountDetails = {
      type: input.discount.type,
      value: input.discount.value,
      amount: discountAmount,
      reason: input.discount.reason,
    };
  }

  // 9. Additional Charges & Round Off
  const serviceCharge = round2(input.serviceCharge || 0);
  const deliveryCharge = round2(input.deliveryCharge || 0);

  const preRoundTotal =
    calculatedSubtotal + totalTax - discountAmount + serviceCharge + deliveryCharge;
  const grandTotal = Math.round(preRoundTotal);
  const roundOff = round2(grandTotal - preRoundTotal);

  // 10. Snapshots
  let customerSnapshot: any = input.customerSnapshot;
  if (!customerSnapshot && order.customerId) {
    const customer = await Customer.findById(order.customerId);
    if (customer) {
      customerSnapshot = {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
      };
    }
  }

  let tableNumber;
  if (order.tableId) {
    const table = await RestaurantTable.findById(order.tableId);
    if (table) {
      tableNumber = table.tableNumber;
    }
  }

  const addrParts = [
    restaurant.address?.street,
    restaurant.address?.city,
    restaurant.address?.state,
    restaurant.address?.postalCode,
  ].filter(Boolean);

  const restaurantSnapshot = {
    name: restaurant.name,
    address: addrParts.join(", "),
    phone: restaurant.phone,
    email: restaurant.email,
    gstin: restaurant.taxSettings?.gstNumber,
    currency: restaurant.currency || "INR",
  };

  // 11. Create Invoice Document
  const invoice = await Invoice.create({
    restaurantId: restObjectId,
    orderId: order._id,
    invoiceNumber,
    customerId: order.customerId,
    customerSnapshot,
    restaurantSnapshot,
    tableNumber,
    orderType: order.orderType,
    items: invoiceItems,
    subtotal: calculatedSubtotal,
    tax: totalTax,
    taxDetails: {
      taxType,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      totalTax,
      breakdown,
    },
    discount: discountAmount,
    discountDetails,
    serviceCharge,
    deliveryCharge,
    roundOff,
    grandTotal,
    paidAmount: 0,
    balanceAmount: grandTotal,
    paymentStatus: "UNPAID",
    status: "ISSUED",
    issuedAt: new Date(),
    createdBy: new Types.ObjectId(staffId),
    idempotencyKey: input.idempotencyKey,
  });

  // 12. Update Order Status to BILLED
  order.status = "BILLED";
  await order.save();

  // 13. Audit Log
  await logSecurityEvent({
    actorId: staffId,
    action: "INVOICE_CREATED",
    entityType: "Invoice",
    entityId: invoice._id,
    restaurantId,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      orderId: order._id.toString(),
      grandTotal: invoice.grandTotal,
    },
  });

  // 14. Real-time Events
  emitToRestaurant(restaurantId, "invoice:created", { invoice });
  emitToRestaurant(restaurantId, "order:billed", {
    orderId: order._id,
    invoiceId: invoice._id,
    status: "BILLED",
  });

  return invoice;
};

export const getInvoices = async (
  restaurantId: string,
  query: ListInvoicesQuery
): Promise<{
  invoices: IInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> => {
  const restObjectId = new Types.ObjectId(restaurantId);
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = { restaurantId: restObjectId };

  if (query.status) {
    filter.status = query.status;
  }
  if (query.paymentStatus) {
    filter.paymentStatus = query.paymentStatus;
  }
  if (query.orderId) {
    filter.orderId = new Types.ObjectId(query.orderId);
  }
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) {
      filter.createdAt.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      filter.createdAt.$lte = new Date(query.endDate);
    }
  }
  if (query.search) {
    const searchRegex = new RegExp(query.search.trim(), "i");
    filter.$or = [
      { invoiceNumber: searchRegex },
      { "customerSnapshot.name": searchRegex },
      { "customerSnapshot.phone": searchRegex },
      { tableNumber: searchRegex },
    ];
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(filter),
  ]);

  return {
    invoices,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

export const getInvoiceById = async (
  restaurantId: string,
  invoiceId: string
): Promise<{ invoice: IInvoice; payments: IPayment[] }> => {
  const restObjectId = new Types.ObjectId(restaurantId);
  const invObjectId = new Types.ObjectId(invoiceId);

  const invoice = await Invoice.findOne({
    _id: invObjectId,
    restaurantId: restObjectId,
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const payments = await Payment.find({
    restaurantId: restObjectId,
    invoiceId: invoice._id,
  }).sort({ createdAt: 1 });

  return { invoice, payments };
};

export const recordPayment = async (
  restaurantId: string,
  invoiceId: string,
  input: RecordPaymentInput,
  staffId: string
): Promise<{ payment: IPayment; invoice: IInvoice }> => {
  const restObjectId = new Types.ObjectId(restaurantId);
  const invObjectId = new Types.ObjectId(invoiceId);

  // 1. Idempotency Check
  if (input.idempotencyKey) {
    const existing = await Payment.findOne({
      restaurantId: restObjectId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      const invoice = await Invoice.findById(existing.invoiceId);
      if (!invoice) throw new Error("Invoice not found");
      return { payment: existing, invoice };
    }
  }

  // 2. Validate Invoice
  const invoice = await Invoice.findOne({
    _id: invObjectId,
    restaurantId: restObjectId,
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (invoice.status === "VOID") {
    throw new Error("Cannot record payment for a voided invoice");
  }

  if (invoice.paymentStatus === "PAID") {
    throw new Error("Invoice is already fully settled");
  }

  const paymentAmount = round2(input.amount);
  if (paymentAmount > round2(invoice.balanceAmount + 0.001)) {
    throw new Error(
      `Payment amount (${paymentAmount}) exceeds invoice balance (${invoice.balanceAmount})`
    );
  }

  // 3. Cash details
  let cashDetails;
  if (input.paymentMethod === "CASH") {
    const cashReceived = round2(
      input.cashDetails?.cashReceived ?? paymentAmount
    );
    const changeReturned = Math.max(0, round2(cashReceived - paymentAmount));
    cashDetails = { cashReceived, changeReturned };
  }

  // 4. Sequential Payment Number (PAY-YYYYMMDD-XXXX)
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const countToday = await Payment.countDocuments({
    restaurantId: restObjectId,
    createdAt: { $gte: startOfDay },
  });

  let seq = countToday + 1;
  let paymentNumber = `PAY-${dateStr}-${String(seq).padStart(4, "0")}`;

  while (
    await Payment.findOne({
      restaurantId: restObjectId,
      paymentNumber,
    })
  ) {
    seq += 1;
    paymentNumber = `PAY-${dateStr}-${String(seq).padStart(4, "0")}`;
  }

  // 5. Create Payment record
  const payment = await Payment.create({
    restaurantId: restObjectId,
    invoiceId: invoice._id,
    orderId: invoice.orderId,
    paymentNumber,
    amount: paymentAmount,
    paymentMethod: input.paymentMethod,
    transactionReference: input.transactionReference,
    paymentStatus: "SUCCESS",
    cashDetails,
    recordedBy: new Types.ObjectId(staffId),
    notes: input.notes,
    idempotencyKey: input.idempotencyKey,
    refundStatus: "NONE",
    refundedAmount: 0,
    refundHistory: [],
  });

  // 6. Update Invoice balance and paymentStatus
  const newPaidAmount = round2(invoice.paidAmount + paymentAmount);
  const newBalanceAmount = Math.max(0, round2(invoice.grandTotal - newPaidAmount));
  const isFullySettled = newBalanceAmount <= 0.001;

  invoice.paidAmount = newPaidAmount;
  invoice.balanceAmount = newBalanceAmount;
  invoice.paymentStatus = isFullySettled ? "PAID" : "PARTIALLY_PAID";
  await invoice.save();

  // 7. Order & Table Lifecycle Transitions on Full Settlement
  if (isFullySettled) {
    const order = await Order.findOne({
      _id: invoice.orderId,
      restaurantId: restObjectId,
    });

    if (order) {
      order.status = "COMPLETED";
      await order.save();

      // Check Table Release for Dine-in
      if (order.tableId) {
        const remainingActiveOrders = await Order.countDocuments({
          restaurantId: restObjectId,
          tableId: order.tableId,
          _id: { $ne: order._id },
          status: { $nin: ["COMPLETED", "CANCELLED"] },
        });

        if (remainingActiveOrders === 0) {
          const table = await RestaurantTable.findOneAndUpdate(
            { _id: order.tableId, restaurantId: restObjectId },
            { $set: { status: "AVAILABLE" } },
            { new: true }
          );

          if (table) {
            emitToRestaurant(restaurantId, "table:released", {
              tableId: table._id,
              tableNumber: table.tableNumber,
              status: "AVAILABLE",
            });
          }
        }
      }

      emitToRestaurant(restaurantId, "order:completed", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: "COMPLETED",
      });

      emitToRestaurant(restaurantId, "invoice:finalized", {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        paymentStatus: "PAID",
      });
    }
  }

  // 8. Audit Log
  await logSecurityEvent({
    actorId: staffId,
    action: "PAYMENT_RECORDED",
    entityType: "Payment",
    entityId: payment._id,
    restaurantId,
    metadata: {
      paymentNumber: payment.paymentNumber,
      invoiceNumber: invoice.invoiceNumber,
      amount: payment.amount,
      method: payment.paymentMethod,
      balanceRemaining: invoice.balanceAmount,
    },
  });

  // 9. Real-time Events
  emitToRestaurant(restaurantId, "payment:recorded", {
    payment,
    invoice: {
      _id: invoice._id,
      paidAmount: invoice.paidAmount,
      balanceAmount: invoice.balanceAmount,
      paymentStatus: invoice.paymentStatus,
    },
  });

  return { payment, invoice };
};

export const refundPayment = async (
  restaurantId: string,
  paymentId: string,
  input: RefundPaymentInput,
  staffId: string
): Promise<{ payment: IPayment; invoice: IInvoice }> => {
  const restObjectId = new Types.ObjectId(restaurantId);
  const payObjectId = new Types.ObjectId(paymentId);

  const payment = await Payment.findOne({
    _id: payObjectId,
    restaurantId: restObjectId,
  });

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.paymentStatus !== "SUCCESS") {
    throw new Error("Cannot refund a non-successful payment");
  }

  const refundAmount = round2(input.amount);
  const remainingRefundable = round2(payment.amount - payment.refundedAmount);

  if (refundAmount > round2(remainingRefundable + 0.001)) {
    throw new Error(
      `Refund amount (${refundAmount}) exceeds maximum refundable amount (${remainingRefundable})`
    );
  }

  // 1. Record refund in payment
  payment.refundHistory.push({
    amount: refundAmount,
    reason: input.reason,
    refundedBy: new Types.ObjectId(staffId),
    createdAt: new Date(),
  });

  payment.refundedAmount = round2(payment.refundedAmount + refundAmount);
  payment.refundStatus =
    payment.refundedAmount >= payment.amount - 0.001 ? "FULL" : "PARTIAL";

  if (payment.refundStatus === "FULL") {
    payment.paymentStatus = "REFUNDED";
  }
  await payment.save();

  // 2. Adjust Invoice
  const invoice = await Invoice.findOne({
    _id: payment.invoiceId,
    restaurantId: restObjectId,
  });

  if (!invoice) {
    throw new Error("Associated invoice not found");
  }

  invoice.paidAmount = Math.max(0, round2(invoice.paidAmount - refundAmount));
  invoice.balanceAmount = round2(invoice.grandTotal - invoice.paidAmount);

  if (invoice.paidAmount <= 0.001) {
    invoice.paymentStatus = "REFUNDED";
  } else {
    invoice.paymentStatus = "PARTIALLY_PAID";
  }
  await invoice.save();

  // 3. Audit Log
  await logSecurityEvent({
    actorId: staffId,
    action: "PAYMENT_REFUNDED",
    entityType: "Payment",
    entityId: payment._id,
    restaurantId,
    metadata: {
      paymentNumber: payment.paymentNumber,
      invoiceNumber: invoice.invoiceNumber,
      refundAmount,
      reason: input.reason,
    },
  });

  // 4. Real-time Event
  emitToRestaurant(restaurantId, "payment:refunded", {
    payment,
    invoice: {
      _id: invoice._id,
      paidAmount: invoice.paidAmount,
      balanceAmount: invoice.balanceAmount,
      paymentStatus: invoice.paymentStatus,
    },
    refundAmount,
  });

  return { payment, invoice };
};

export const getInvoicePayments = async (
  restaurantId: string,
  invoiceId: string
): Promise<IPayment[]> => {
  const restObjectId = new Types.ObjectId(restaurantId);
  const invObjectId = new Types.ObjectId(invoiceId);

  return Payment.find({
    restaurantId: restObjectId,
    invoiceId: invObjectId,
  }).sort({ createdAt: 1 });
};

export const getAllPayments = async (
  restaurantId: string,
  query: ListPaymentsQuery
): Promise<{
  payments: IPayment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> => {
  const restObjectId = new Types.ObjectId(restaurantId);
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = { restaurantId: restObjectId };

  if (query.paymentStatus) {
    filter.paymentStatus = query.paymentStatus;
  }
  if (query.paymentMethod) {
    filter.paymentMethod = query.paymentMethod;
  }
  if (query.invoiceId) {
    filter.invoiceId = new Types.ObjectId(query.invoiceId);
  }
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) {
      filter.createdAt.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      filter.createdAt.$lte = new Date(query.endDate);
    }
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(filter),
  ]);

  return {
    payments,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

// -------------------------------------------------------------
// THERMAL RECEIPT FORMATTER (58mm & 80mm & Printable HTML)
// -------------------------------------------------------------
export const generateThermalReceipt = async (
  restaurantId: string,
  invoiceId: string
): Promise<{
  invoice: IInvoice;
  payments: IPayment[];
  text58mm: string;
  text80mm: string;
  htmlReceipt: string;
}> => {
  const { invoice, payments } = await getInvoiceById(restaurantId, invoiceId);

  const restName = invoice.restaurantSnapshot?.name || "RESTAURANT";
  const restAddr = invoice.restaurantSnapshot?.address || "";
  const restPhone = invoice.restaurantSnapshot?.phone ? `Phone: ${invoice.restaurantSnapshot.phone}` : "";
  const restGst = invoice.restaurantSnapshot?.gstin ? `GSTIN: ${invoice.restaurantSnapshot.gstin}` : "";
  const curr = invoice.restaurantSnapshot?.currency || "INR";

  const invDate = new Date(invoice.issuedAt || invoice.createdAt).toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  );

  // Helper for centering text
  const center = (text: string, width: number): string => {
    if (text.length >= width) return text.slice(0, width);
    const leftPad = Math.floor((width - text.length) / 2);
    return " ".repeat(leftPad) + text;
  };

  const line58 = "-".repeat(32);
  const line80 = "-".repeat(48);

  // --- 58mm ASCII Layout (32 columns) ---
  const lines58: string[] = [
    center(restName.toUpperCase(), 32),
    ...(restAddr ? [center(restAddr.slice(0, 32), 32)] : []),
    ...(restPhone ? [center(restPhone, 32)] : []),
    ...(restGst ? [center(restGst, 32)] : []),
    line58,
    center("TAX INVOICE", 32),
    `Inv#: ${invoice.invoiceNumber}`,
    `Date: ${invDate}`,
    `Type: ${invoice.orderType}${invoice.tableNumber ? ` | Table: ${invoice.tableNumber}` : ""}`,
    ...(invoice.customerSnapshot?.name
      ? [`Cust: ${invoice.customerSnapshot.name} ${invoice.customerSnapshot.phone || ""}`]
      : []),
    line58,
    "ITEM           QTY  PRICE  TOTAL",
    line58,
  ];

  for (const item of invoice.items) {
    const name = item.name.length > 14 ? item.name.slice(0, 14) : item.name.padEnd(14);
    const qty = String(item.quantity).padStart(3);
    const pr = item.price.toFixed(0).padStart(6);
    const tot = item.itemTotal.toFixed(0).padStart(7);
    lines58.push(`${name} ${qty} ${pr} ${tot}`);
  }

  lines58.push(line58);
  lines58.push(`Subtotal:              ${curr} ${invoice.subtotal.toFixed(2)}`);

  if (invoice.taxDetails.cgst > 0) {
    lines58.push(`CGST:                  ${curr} ${invoice.taxDetails.cgst.toFixed(2)}`);
  }
  if (invoice.taxDetails.sgst > 0) {
    lines58.push(`SGST:                  ${curr} ${invoice.taxDetails.sgst.toFixed(2)}`);
  }
  if (invoice.taxDetails.igst > 0) {
    lines58.push(`IGST:                  ${curr} ${invoice.taxDetails.igst.toFixed(2)}`);
  }
  if (invoice.discount > 0) {
    lines58.push(`Discount:             -${curr} ${invoice.discount.toFixed(2)}`);
  }
  if (invoice.serviceCharge > 0) {
    lines58.push(`Service Charge:        ${curr} ${invoice.serviceCharge.toFixed(2)}`);
  }
  if (invoice.deliveryCharge > 0) {
    lines58.push(`Delivery Charge:       ${curr} ${invoice.deliveryCharge.toFixed(2)}`);
  }
  if (invoice.roundOff !== 0) {
    lines58.push(`Round Off:             ${curr} ${invoice.roundOff.toFixed(2)}`);
  }
  lines58.push(line58);
  lines58.push(`GRAND TOTAL:           ${curr} ${invoice.grandTotal.toFixed(2)}`);
  lines58.push(`Paid Amount:           ${curr} ${invoice.paidAmount.toFixed(2)}`);
  lines58.push(`Balance Due:           ${curr} ${invoice.balanceAmount.toFixed(2)}`);
  lines58.push(`Status: ${invoice.paymentStatus}`);

  if (payments.length > 0) {
    lines58.push(line58);
    lines58.push("PAYMENTS:");
    for (const p of payments) {
      lines58.push(`${p.paymentMethod}: ${curr} ${p.amount.toFixed(2)} (${p.paymentStatus})`);
      if (p.cashDetails && p.cashDetails.changeReturned > 0) {
        lines58.push(` Recv: ${curr} ${p.cashDetails.cashReceived.toFixed(2)} | Change: ${curr} ${p.cashDetails.changeReturned.toFixed(2)}`);
      }
    }
  }

  lines58.push(line58);
  lines58.push(center("Thank You! Visit Again!", 32));
  const text58mm = lines58.join("\n");

  // --- 80mm ASCII Layout (48 columns) ---
  const lines80: string[] = [
    center(restName.toUpperCase(), 48),
    ...(restAddr ? [center(restAddr, 48)] : []),
    ...(restPhone ? [center(restPhone, 48)] : []),
    ...(restGst ? [center(restGst, 48)] : []),
    line80,
    center("TAX INVOICE", 48),
    `Invoice: ${invoice.invoiceNumber.padEnd(20)} Date: ${invDate}`,
    `Order Type: ${invoice.orderType.padEnd(16)} Table: ${invoice.tableNumber || "N/A"}`,
    ...(invoice.customerSnapshot?.name
      ? [`Customer: ${invoice.customerSnapshot.name} (${invoice.customerSnapshot.phone || "No phone"})`]
      : []),
    line80,
    "ITEM NAME                  QTY    RATE   TAX%     TOTAL",
    line80,
  ];

  for (const item of invoice.items) {
    const name = item.name.length > 24 ? item.name.slice(0, 24) : item.name.padEnd(24);
    const qty = String(item.quantity).padStart(5);
    const rate = item.price.toFixed(2).padStart(8);
    const tax = `${item.taxRate}%`.padStart(6);
    const tot = item.itemTotal.toFixed(2).padStart(10);
    lines80.push(`${name} ${qty} ${rate} ${tax} ${tot}`);
  }

  lines80.push(line80);
  lines80.push(`Subtotal:                              ${curr} ${invoice.subtotal.toFixed(2).padStart(8)}`);
  if (invoice.taxDetails.cgst > 0) {
    lines80.push(`CGST:                                  ${curr} ${invoice.taxDetails.cgst.toFixed(2).padStart(8)}`);
  }
  if (invoice.taxDetails.sgst > 0) {
    lines80.push(`SGST:                                  ${curr} ${invoice.taxDetails.sgst.toFixed(2).padStart(8)}`);
  }
  if (invoice.taxDetails.igst > 0) {
    lines80.push(`IGST:                                  ${curr} ${invoice.taxDetails.igst.toFixed(2).padStart(8)}`);
  }
  if (invoice.discount > 0) {
    lines80.push(`Discount:                             -${curr} ${invoice.discount.toFixed(2).padStart(8)}`);
  }
  if (invoice.serviceCharge > 0) {
    lines80.push(`Service Charge:                        ${curr} ${invoice.serviceCharge.toFixed(2).padStart(8)}`);
  }
  if (invoice.deliveryCharge > 0) {
    lines80.push(`Delivery Charge:                       ${curr} ${invoice.deliveryCharge.toFixed(2).padStart(8)}`);
  }
  if (invoice.roundOff !== 0) {
    lines80.push(`Round Off:                             ${curr} ${invoice.roundOff.toFixed(2).padStart(8)}`);
  }
  lines80.push(line80);
  lines80.push(`GRAND TOTAL:                           ${curr} ${invoice.grandTotal.toFixed(2).padStart(8)}`);
  lines80.push(`Paid Amount:                           ${curr} ${invoice.paidAmount.toFixed(2).padStart(8)}`);
  lines80.push(`Balance Due:                           ${curr} ${invoice.balanceAmount.toFixed(2).padStart(8)}`);

  if (payments.length > 0) {
    lines80.push(line80);
    lines80.push("PAYMENT SUMMARY:");
    for (const p of payments) {
      lines80.push(
        `• ${p.paymentMethod.padEnd(12)} ${p.paymentNumber.padEnd(20)} ${curr} ${p.amount.toFixed(2).padStart(8)}`
      );
    }
  }

  lines80.push(line80);
  lines80.push(center("Thank You For Dining With Us!", 48));
  const text80mm = lines80.join("\n");

  // --- HTML Printable Receipt ---
  const htmlReceipt = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt ${invoice.invoiceNumber}</title>
  <style>
    @page { margin: 0; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      width: 78mm;
      margin: 0 auto;
      padding: 10px;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { font-size: 11px; padding: 2px 0; }
    .title { font-size: 15px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">${restName}</div>
    ${restAddr ? `<div>${restAddr}</div>` : ""}
    ${restPhone ? `<div>${restPhone}</div>` : ""}
    ${restGst ? `<div>${restGst}</div>` : ""}
    <div class="divider"></div>
    <div class="bold">TAX INVOICE</div>
    <div>${invoice.invoiceNumber}</div>
    <div>${invDate}</div>
    <div>${invoice.orderType} ${invoice.tableNumber ? `| Table: ${invoice.tableNumber}` : ""}</div>
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th align="left">Item</th>
        <th align="center">Qty</th>
        <th align="right">Price</th>
        <th align="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.items
        .map(
          (i) => `
        <tr>
          <td>${i.name}</td>
          <td align="center">${i.quantity}</td>
          <td align="right">${i.price.toFixed(2)}</td>
          <td align="right">${i.itemTotal.toFixed(2)}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr><td>Subtotal</td><td class="right">${curr} ${invoice.subtotal.toFixed(2)}</td></tr>
    ${invoice.taxDetails.cgst > 0 ? `<tr><td>CGST</td><td class="right">${curr} ${invoice.taxDetails.cgst.toFixed(2)}</td></tr>` : ""}
    ${invoice.taxDetails.sgst > 0 ? `<tr><td>SGST</td><td class="right">${curr} ${invoice.taxDetails.sgst.toFixed(2)}</td></tr>` : ""}
    ${invoice.taxDetails.igst > 0 ? `<tr><td>IGST</td><td class="right">${curr} ${invoice.taxDetails.igst.toFixed(2)}</td></tr>` : ""}
    ${invoice.discount > 0 ? `<tr><td>Discount</td><td class="right">-${curr} ${invoice.discount.toFixed(2)}</td></tr>` : ""}
    ${invoice.serviceCharge > 0 ? `<tr><td>Service Charge</td><td class="right">${curr} ${invoice.serviceCharge.toFixed(2)}</td></tr>` : ""}
    ${invoice.deliveryCharge > 0 ? `<tr><td>Delivery Charge</td><td class="right">${curr} ${invoice.deliveryCharge.toFixed(2)}</td></tr>` : ""}
    ${invoice.roundOff !== 0 ? `<tr><td>Round Off</td><td class="right">${curr} ${invoice.roundOff.toFixed(2)}</td></tr>` : ""}
    <tr class="bold"><td>GRAND TOTAL</td><td class="right">${curr} ${invoice.grandTotal.toFixed(2)}</td></tr>
    <tr><td>Paid</td><td class="right">${curr} ${invoice.paidAmount.toFixed(2)}</td></tr>
    <tr class="bold"><td>Balance Due</td><td class="right">${curr} ${invoice.balanceAmount.toFixed(2)}</td></tr>
  </table>

  ${
    payments.length > 0
      ? `
  <div class="divider"></div>
  <div class="bold">Payments:</div>
  <table>
    ${payments
      .map(
        (p) => `
      <tr>
        <td>${p.paymentMethod}</td>
        <td class="right">${curr} ${p.amount.toFixed(2)}</td>
      </tr>
      ${
        p.cashDetails && p.cashDetails.changeReturned > 0
          ? `<tr><td style="font-size:9px;color:#555;">Change Returned</td><td class="right" style="font-size:9px;">${curr} ${p.cashDetails.changeReturned.toFixed(2)}</td></tr>`
          : ""
      }`
      )
      .join("")}
  </table>`
      : ""
  }

  <div class="divider"></div>
  <div class="center" style="margin-top:8px;">Thank you for dining with us!</div>
</body>
</html>
  `.trim();

  return {
    invoice,
    payments,
    text58mm,
    text80mm,
    htmlReceipt,
  };
};

// -------------------------------------------------------------
// SERVER-SIDE PDF INVOICE GENERATOR (pdfkit)
// -------------------------------------------------------------
export const generateInvoicePdf = async (
  restaurantId: string,
  invoiceId: string
): Promise<Buffer> => {
  const { invoice, payments } = await getInvoiceById(restaurantId, invoiceId);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    const restName = invoice.restaurantSnapshot?.name || "RESTAURANT NAME";
    const restAddr = invoice.restaurantSnapshot?.address || "";
    const restPhone = invoice.restaurantSnapshot?.phone ? `Phone: ${invoice.restaurantSnapshot.phone}` : "";
    const restGst = invoice.restaurantSnapshot?.gstin ? `GSTIN: ${invoice.restaurantSnapshot.gstin}` : "";
    const curr = invoice.restaurantSnapshot?.currency || "INR";

    // 1. Header Section
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor("#1a365d")
      .text(restName, 40, 40);

    doc.fontSize(9).font("Helvetica").fillColor("#4a5568");
    let currentY = 65;
    if (restAddr) {
      doc.text(restAddr, 40, currentY);
      currentY += 13;
    }
    if (restPhone || restGst) {
      doc.text([restPhone, restGst].filter(Boolean).join("  |  "), 40, currentY);
      currentY += 13;
    }

    // Invoice badge on the top right
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#2d3748")
      .text("TAX INVOICE", 380, 40, { align: "right" });

    doc.fontSize(9).font("Helvetica").fillColor("#718096");
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, 380, 62, { align: "right" });
    doc.text(
      `Date: ${new Date(invoice.issuedAt || invoice.createdAt).toLocaleDateString("en-IN")}`,
      380,
      76,
      { align: "right" }
    );
    doc.text(
      `Status: ${invoice.paymentStatus}`,
      380,
      90,
      { align: "right" }
    );

    // Horizontal line
    currentY = Math.max(currentY + 15, 110);
    doc
      .strokeColor("#e2e8f0")
      .lineWidth(1)
      .moveTo(40, currentY)
      .lineTo(555, currentY)
      .stroke();

    // 2. Billing & Order Details
    currentY += 12;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#2d3748").text("Billed To:", 40, currentY);
    doc.text("Order Details:", 320, currentY);

    currentY += 14;
    doc.fontSize(9).font("Helvetica").fillColor("#4a5568");
    if (invoice.customerSnapshot?.name) {
      doc.text(`Name: ${invoice.customerSnapshot.name}`, 40, currentY);
      if (invoice.customerSnapshot.phone) {
        doc.text(`Phone: ${invoice.customerSnapshot.phone}`, 40, currentY + 13);
      }
      if (invoice.customerSnapshot.gstin) {
        doc.text(`GSTIN: ${invoice.customerSnapshot.gstin}`, 40, currentY + 26);
      }
    } else {
      doc.text("Walk-in Customer", 40, currentY);
    }

    doc.text(`Order Type: ${invoice.orderType}`, 320, currentY);
    if (invoice.tableNumber) {
      doc.text(`Table: ${invoice.tableNumber}`, 320, currentY + 13);
    }

    // 3. Item Table
    currentY += 45;
    doc
      .rect(40, currentY, 515, 22)
      .fillColor("#edf2f7")
      .fill();

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#2d3748");
    doc.text("#", 45, currentY + 6);
    doc.text("Item Name", 75, currentY + 6);
    doc.text("Qty", 320, currentY + 6, { width: 35, align: "center" });
    doc.text("Rate", 370, currentY + 6, { width: 55, align: "right" });
    doc.text("Tax", 440, currentY + 6, { width: 40, align: "right" });
    doc.text("Amount", 495, currentY + 6, { width: 55, align: "right" });

    currentY += 26;
    doc.font("Helvetica").fontSize(9).fillColor("#4a5568");

    invoice.items.forEach((item, index) => {
      // Row alternating highlight
      if (index % 2 === 1) {
        doc.rect(40, currentY - 2, 515, 18).fillColor("#f7fafc").fill();
      }

      doc.fillColor("#4a5568");
      doc.text(String(index + 1), 45, currentY);
      doc.text(item.name, 75, currentY, { width: 235 });
      doc.text(String(item.quantity), 320, currentY, { width: 35, align: "center" });
      doc.text(item.price.toFixed(2), 370, currentY, { width: 55, align: "right" });
      doc.text(`${item.taxRate}%`, 440, currentY, { width: 40, align: "right" });
      doc.text(item.itemTotal.toFixed(2), 495, currentY, { width: 55, align: "right" });

      currentY += 18;
    });

    // Line after table
    currentY += 6;
    doc.strokeColor("#cbd5e0").lineWidth(1).moveTo(40, currentY).lineTo(555, currentY).stroke();

    // 4. Totals Breakdown Section
    currentY += 10;
    const totalsLeft = 360;
    const totalsValueLeft = 475;
    const totalsWidth = 75;

    doc.fontSize(9).font("Helvetica").fillColor("#4a5568");
    doc.text("Subtotal:", totalsLeft, currentY);
    doc.text(`${curr} ${invoice.subtotal.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });

    if (invoice.taxDetails.cgst > 0) {
      currentY += 14;
      doc.text("CGST:", totalsLeft, currentY);
      doc.text(`${curr} ${invoice.taxDetails.cgst.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });
    }
    if (invoice.taxDetails.sgst > 0) {
      currentY += 14;
      doc.text("SGST:", totalsLeft, currentY);
      doc.text(`${curr} ${invoice.taxDetails.sgst.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });
    }
    if (invoice.taxDetails.igst > 0) {
      currentY += 14;
      doc.text("IGST:", totalsLeft, currentY);
      doc.text(`${curr} ${invoice.taxDetails.igst.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });
    }
    if (invoice.discount > 0) {
      currentY += 14;
      doc.text("Discount:", totalsLeft, currentY);
      doc.text(`-${curr} ${invoice.discount.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });
    }
    if (invoice.serviceCharge > 0) {
      currentY += 14;
      doc.text("Service Charge:", totalsLeft, currentY);
      doc.text(`${curr} ${invoice.serviceCharge.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });
    }
    if (invoice.deliveryCharge > 0) {
      currentY += 14;
      doc.text("Delivery Charge:", totalsLeft, currentY);
      doc.text(`${curr} ${invoice.deliveryCharge.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });
    }
    if (invoice.roundOff !== 0) {
      currentY += 14;
      doc.text("Round Off:", totalsLeft, currentY);
      doc.text(`${curr} ${invoice.roundOff.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });
    }

    currentY += 18;
    doc
      .rect(totalsLeft - 5, currentY - 4, 200, 24)
      .fillColor("#edf2f7")
      .fill();

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a365d");
    doc.text("Grand Total:", totalsLeft, currentY + 2);
    doc.text(`${curr} ${invoice.grandTotal.toFixed(2)}`, totalsValueLeft, currentY + 2, { width: totalsWidth, align: "right" });

    currentY += 30;
    doc.fontSize(9).font("Helvetica").fillColor("#4a5568");
    doc.text("Paid Amount:", totalsLeft, currentY);
    doc.text(`${curr} ${invoice.paidAmount.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });

    currentY += 14;
    doc.font("Helvetica-Bold");
    doc.text("Balance Due:", totalsLeft, currentY);
    doc.text(`${curr} ${invoice.balanceAmount.toFixed(2)}`, totalsValueLeft, currentY, { width: totalsWidth, align: "right" });

    // 5. Payment details on the left side
    let payY = currentY - (payments.length * 14 + 20);
    if (payments.length > 0 && payY > 200) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#2d3748").text("Payment History:", 40, payY);
      payY += 14;
      doc.font("Helvetica").fillColor("#4a5568");
      for (const p of payments) {
        doc.text(
          `• ${p.paymentMethod} - ${curr} ${p.amount.toFixed(2)} (${p.paymentStatus}) [${p.paymentNumber}]`,
          40,
          payY
        );
        payY += 14;
      }
    }

    // 6. Footer
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#a0aec0")
      .text(
        "Thank you for your business! This is a computer-generated invoice.",
        40,
        770,
        { align: "center", width: 515 }
      );

    doc.end();
  });
};

