import { Types } from "mongoose";
import { Order, IOrder, IOrderItem, OrderStatus, OrderType } from "../models/Order";
import { KOT, IKOT, KitchenStatus, KOTPriority } from "../models/KOT";
import { MenuItem } from "../models/MenuItem";
import { RestaurantTable } from "../models/RestaurantTable";
import { Restaurant } from "../models/Restaurant";
import { Invoice } from "../models/Invoice";
import { emitToRestaurant } from "./socketService";
import { logSecurityEvent } from "./auditService";

// -------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------

export const generateOrderNumber = async (restaurantId: string): Promise<string> => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const restObjectId = new Types.ObjectId(restaurantId);

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const countToday = await Order.countDocuments({
    restaurantId: restObjectId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  let seq = countToday + 1;
  let orderNumber = `ORD-${dateStr}-${String(seq).padStart(4, "0")}`;

  while (await Order.findOne({ restaurantId: restObjectId, orderNumber })) {
    seq += 1;
    orderNumber = `ORD-${dateStr}-${String(seq).padStart(4, "0")}`;
  }

  return orderNumber;
};

export const generateKOTNumber = async (restaurantId: string): Promise<string> => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const restObjectId = new Types.ObjectId(restaurantId);

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const countToday = await KOT.countDocuments({
    restaurantId: restObjectId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  let seq = countToday + 1;
  let kotNumber = `KOT-${dateStr}-${String(seq).padStart(4, "0")}`;

  // Check both date format and legacy KOT-XXXX format to guarantee unique index satisfaction
  while (
    (await KOT.findOne({ restaurantId: restObjectId, kotNumber })) ||
    (await KOT.findOne({ restaurantId: restObjectId, kotNumber: `KOT-${String(seq).padStart(4, "0")}` }))
  ) {
    seq += 1;
    kotNumber = `KOT-${dateStr}-${String(seq).padStart(4, "0")}`;
  }

  return kotNumber;
};

export const calculateOrderTotals = (
  items: IOrderItem[],
  discountInput: number = 0
) => {
  let subtotal = 0;
  let tax = 0;

  for (const item of items) {
    if (item.status !== "CANCELLED") {
      const lineTotal = Math.round(item.price * item.quantity * 100) / 100;
      item.itemTotal = lineTotal;
      subtotal += lineTotal;

      const lineTax = Math.round(((lineTotal * (item.taxRate || 0)) / 100) * 100) / 100;
      tax += lineTax;
    }
  }

  subtotal = Math.round(subtotal * 100) / 100;
  tax = Math.round(tax * 100) / 100;
  const discount = Math.round(Math.max(0, discountInput) * 100) / 100;
  const grandTotal = Math.round(Math.max(0, subtotal + tax - discount) * 100) / 100;

  return { subtotal, tax, discount, grandTotal };
};

// -------------------------------------------------------------
// 1. ORDER CREATION & MANAGEMENT
// -------------------------------------------------------------

export interface CreateOrderInput {
  orderType: OrderType;
  tableId?: string;
  customerId?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string;
  }>;
  discount?: number;
  idempotencyKey?: string;
}

export const createOrder = async (
  restaurantId: string,
  input: CreateOrderInput,
  createdBy: string
) => {
  const restObjectId = new Types.ObjectId(restaurantId);

  // Idempotency check: avoid duplicate order submission
  if (input.idempotencyKey) {
    const existing = await Order.findOne({
      restaurantId: restObjectId,
      idempotencyKey: input.idempotencyKey.trim(),
    })
      .populate("tableId", "tableNumber floor status")
      .populate("customerId", "name phone");

    if (existing) {
      return existing;
    }
  }

  let table: any = null;

  // Dine-in order table validation
  if (input.orderType === "DINE_IN") {
    if (!input.tableId) {
      throw new Error("Table is required for dine-in orders.");
    }

    table = await RestaurantTable.findOne({
      _id: input.tableId,
      restaurantId: restObjectId,
    });

    if (!table) {
      throw new Error("Specified table does not belong to your restaurant.");
    }

    // Prevent conflicting active orders on the same table
    const conflictingOrder = await Order.findOne({
      restaurantId: restObjectId,
      tableId: input.tableId,
      status: { $in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "BILLED"] },
    });

    if (conflictingOrder) {
      throw new Error(
        `Table '${table.tableNumber}' is already occupied by active order ${conflictingOrder.orderNumber}.`
      );
    }
  }

  // Validate Menu Items & Build Secure Price Snapshots
  const itemIds = input.items.map((i) => new Types.ObjectId(i.menuItemId));
  const menuItems = await MenuItem.find({
    _id: { $in: itemIds },
    restaurantId: restObjectId,
  });

  const menuItemMap = new Map<string, any>();
  menuItems.forEach((m) => menuItemMap.set(m._id.toString(), m));

  const orderItems: IOrderItem[] = [];

  for (const itemInput of input.items) {
    const menuItem = menuItemMap.get(itemInput.menuItemId);
    if (!menuItem) {
      throw new Error(`Menu item '${itemInput.menuItemId}' does not exist in your restaurant.`);
    }

    if (!menuItem.availability) {
      throw new Error(`Item '${menuItem.name}' is currently marked unavailable.`);
    }

    const price = menuItem.price;
    const taxRate = menuItem.taxRate || 5;
    const quantity = itemInput.quantity;
    const itemTotal = Math.round(price * quantity * 100) / 100;

    orderItems.push({
      menuItemId: menuItem._id,
      name: menuItem.name,
      price,
      quantity,
      submittedQuantity: 0,
      taxRate,
      notes: itemInput.notes,
      itemTotal,
      status: "ACTIVE",
    });
  }

  const { subtotal, tax, discount, grandTotal } = calculateOrderTotals(
    orderItems,
    input.discount || 0
  );

  const orderNumber = await generateOrderNumber(restaurantId);

  const order = await Order.create({
    restaurantId: restObjectId,
    orderNumber,
    tableId: input.tableId ? new Types.ObjectId(input.tableId) : undefined,
    customerId: input.customerId ? new Types.ObjectId(input.customerId) : undefined,
    orderType: input.orderType,
    items: orderItems,
    status: "CONFIRMED",
    subtotal,
    tax,
    discount,
    grandTotal,
    createdBy: new Types.ObjectId(createdBy),
    idempotencyKey: input.idempotencyKey,
  });

  // Mark table occupied for dine-in orders
  if (input.orderType === "DINE_IN" && input.tableId) {
    await RestaurantTable.findByIdAndUpdate(input.tableId, { status: "OCCUPIED" });
    emitToRestaurant(restaurantId, "table:status-updated", {
      tableId: input.tableId,
      status: "OCCUPIED",
    });
  }

  // Populate references
  const populatedOrder = await Order.findById(order._id)
    .populate("tableId", "tableNumber floor status")
    .populate("customerId", "name phone")
    .populate("createdBy", "name role");

  // Real-time broadcast
  emitToRestaurant(restaurantId, "order:created", { order: populatedOrder });

  await logSecurityEvent({
    actorId: createdBy,
    action: "ORDER_CREATED",
    entityType: "Order",
    entityId: order._id.toString(),
    restaurantId,
    metadata: {
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      grandTotal: order.grandTotal,
      tableNumber: table ? table.tableNumber : undefined,
    },
  });

  return populatedOrder;
};

export const getOrders = async (
  restaurantId: string,
  params: {
    status?: string;
    orderType?: string;
    tableId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
) => {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const query: any = { restaurantId: new Types.ObjectId(restaurantId) };
  if (params.status) query.status = params.status;
  if (params.orderType) query.orderType = params.orderType;
  if (params.tableId && Types.ObjectId.isValid(params.tableId)) query.tableId = params.tableId;
  if (params.search) {
    query.orderNumber = new RegExp(params.search.trim(), "i");
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("tableId", "tableNumber floor status")
      .populate("customerId", "name phone")
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(query),
  ]);

  return {
    orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getOrderById = async (restaurantId: string, orderId: string) => {
  if (!Types.ObjectId.isValid(orderId)) {
    throw new Error("Invalid order ID format.");
  }

  const order = await Order.findOne({
    _id: orderId,
    restaurantId,
  })
    .populate("tableId", "tableNumber floor status")
    .populate("customerId", "name phone email")
    .populate("createdBy", "name role");

  if (!order) {
    throw new Error("Order not found.");
  }

  const kots = await KOT.find({ orderId: order._id, restaurantId }).sort({ createdAt: 1 });

  return { order, kots };
};

export const updateOrder = async (
  restaurantId: string,
  orderId: string,
  updateData: any,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(orderId)) {
    throw new Error("Invalid order ID format.");
  }

  const order = await Order.findOne({ _id: orderId, restaurantId });
  if (!order) {
    throw new Error("Order not found.");
  }

  if (["COMPLETED", "CANCELLED"].includes(order.status)) {
    throw new Error(`Cannot modify order in '${order.status}' state.`);
  }

  if (order.status === "BILLED" && updateData.status !== "COMPLETED") {
    throw new Error(`Cannot modify order in 'BILLED' state.`);
  }

  // Handle Table Transfer
  if (updateData.tableId && updateData.tableId !== order.tableId?.toString()) {
    const newTable = await RestaurantTable.findOne({
      _id: updateData.tableId,
      restaurantId,
    });
    if (!newTable) {
      throw new Error("Target table not found in your restaurant.");
    }

    const existingOccupy = await Order.findOne({
      restaurantId,
      tableId: updateData.tableId,
      _id: { $ne: orderId },
      status: { $in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "BILLED"] },
    });
    if (existingOccupy) {
      throw new Error(`Table '${newTable.tableNumber}' is already occupied.`);
    }

    const oldTableId = order.tableId;

    order.tableId = new Types.ObjectId(updateData.tableId);
    await newTable.updateOne({ status: "OCCUPIED" });
    emitToRestaurant(restaurantId, "table:status-updated", {
      tableId: updateData.tableId,
      status: "OCCUPIED",
    });

    if (oldTableId) {
      // Check if any other order occupies the old table
      const otherOnOld = await Order.findOne({
        restaurantId,
        tableId: oldTableId,
        _id: { $ne: orderId },
        status: { $in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "BILLED"] },
      });
      if (!otherOnOld) {
        await RestaurantTable.findByIdAndUpdate(oldTableId, { status: "AVAILABLE" });
        emitToRestaurant(restaurantId, "table:status-updated", {
          tableId: oldTableId.toString(),
          status: "AVAILABLE",
        });
      }
    }
  }

  const isTransitioningFromBilled = order.status === "BILLED";

  if (updateData.status) {
    order.status = updateData.status;

    // Release table when order is COMPLETED
    if (updateData.status === "COMPLETED") {
      if (order.tableId) {
        const remainingActive = await Order.countDocuments({
          restaurantId,
          tableId: order.tableId,
          _id: { $ne: order._id },
          status: { $nin: ["COMPLETED", "CANCELLED"] },
        });
        if (remainingActive === 0) {
          await RestaurantTable.findByIdAndUpdate(order.tableId, { status: "AVAILABLE" });
          emitToRestaurant(restaurantId, "table:status-updated", {
            tableId: order.tableId.toString(),
            status: "AVAILABLE",
          });
        }
      }

      // If invoice exists and was UNPAID, mark as settled
      const invoice = await Invoice.findOne({
        restaurantId: new Types.ObjectId(restaurantId),
        orderId: order._id,
        status: { $ne: "VOID" },
      });
      if (invoice && invoice.paymentStatus !== "PAID") {
        invoice.paymentStatus = "PAID";
        invoice.paidAmount = invoice.grandTotal;
        invoice.balanceAmount = 0;
        await invoice.save();
      }
    }
  }

  if (!isTransitioningFromBilled) {
    if (updateData.discount !== undefined) {
      order.discount = updateData.discount;
    }

    const { subtotal, tax, discount, grandTotal } = calculateOrderTotals(
      order.items,
      order.discount
    );
    order.subtotal = subtotal;
    order.tax = tax;
    order.discount = discount;
    order.grandTotal = grandTotal;
  }

  await order.save();

  const populated = await Order.findById(order._id)
    .populate("tableId", "tableNumber floor status")
    .populate("customerId", "name phone");

  emitToRestaurant(restaurantId, "order:updated", { order: populated });

  // If order transitioned to READY, emit dedicated food-ready broadcast
  if (order.status === "READY") {
    const tableNum = (populated?.tableId as any)?.tableNumber
      ? `Table ${(populated?.tableId as any).tableNumber}`
      : populated?.orderType || "Takeaway/Delivery";
    emitToRestaurant(restaurantId, "kitchen:order-ready", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      tableNumber: tableNum,
      status: "READY",
      timestamp: new Date().toISOString(),
    });
  }

  await logSecurityEvent({
    actorId,
    action: "ORDER_UPDATED",
    entityType: "Order",
    entityId: orderId,
    restaurantId,
    metadata: { orderNumber: order.orderNumber, status: order.status },
  });

  return populated;
};

export const addItemsToOrder = async (
  restaurantId: string,
  orderId: string,
  newItemsData: Array<{ menuItemId: string; quantity: number; notes?: string }>,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(orderId)) {
    throw new Error("Invalid order ID format.");
  }

  const order = await Order.findOne({ _id: orderId, restaurantId });
  if (!order) {
    throw new Error("Order not found.");
  }

  if (["COMPLETED", "BILLED", "CANCELLED"].includes(order.status)) {
    throw new Error(`Cannot add items to order in '${order.status}' status.`);
  }

  const itemIds = newItemsData.map((i) => new Types.ObjectId(i.menuItemId));
  const menuItems = await MenuItem.find({
    _id: { $in: itemIds },
    restaurantId,
  });

  const menuItemMap = new Map<string, any>();
  menuItems.forEach((m) => menuItemMap.set(m._id.toString(), m));

  for (const itemInput of newItemsData) {
    const menuItem = menuItemMap.get(itemInput.menuItemId);
    if (!menuItem) {
      throw new Error(`Menu item '${itemInput.menuItemId}' does not exist in your restaurant.`);
    }
    if (!menuItem.availability) {
      throw new Error(`Item '${menuItem.name}' is unavailable.`);
    }

    const price = menuItem.price;
    const taxRate = menuItem.taxRate || 5;
    const quantity = itemInput.quantity;
    const itemTotal = Math.round(price * quantity * 100) / 100;

    order.items.push({
      menuItemId: menuItem._id,
      name: menuItem.name,
      price,
      quantity,
      submittedQuantity: 0,
      taxRate,
      notes: itemInput.notes,
      itemTotal,
      status: "ACTIVE",
    });
  }

  const { subtotal, tax, discount, grandTotal } = calculateOrderTotals(
    order.items,
    order.discount
  );
  order.subtotal = subtotal;
  order.tax = tax;
  order.discount = discount;
  order.grandTotal = grandTotal;

  await order.save();

  const populated = await Order.findById(order._id)
    .populate("tableId", "tableNumber floor status")
    .populate("customerId", "name phone");

  emitToRestaurant(restaurantId, "order:updated", { order: populated });

  // If order transitioned to READY, emit dedicated food-ready broadcast
  if (order.status === "READY") {
    const tableNum = (populated?.tableId as any)?.tableNumber
      ? `Table ${(populated?.tableId as any).tableNumber}`
      : populated?.orderType || "Takeaway/Delivery";
    emitToRestaurant(restaurantId, "kitchen:order-ready", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      tableNumber: tableNum,
      status: "READY",
      timestamp: new Date().toISOString(),
    });
  }

  await logSecurityEvent({
    actorId,
    action: "ORDER_ITEMS_ADDED",
    entityType: "Order",
    entityId: orderId,
    restaurantId,
    metadata: { addedCount: newItemsData.length, newGrandTotal: order.grandTotal },
  });

  return populated;
};

export const updateOrderItem = async (
  restaurantId: string,
  orderId: string,
  itemId: string,
  updateData: { quantity?: number; notes?: string },
  actorId: string
) => {
  if (!Types.ObjectId.isValid(orderId) || !Types.ObjectId.isValid(itemId)) {
    throw new Error("Invalid ID format.");
  }

  const order = await Order.findOne({ _id: orderId, restaurantId });
  if (!order) {
    throw new Error("Order not found.");
  }

  if (["COMPLETED", "BILLED", "CANCELLED"].includes(order.status)) {
    throw new Error(`Cannot modify items on order in '${order.status}' status.`);
  }

  const item = (order.items as any).id(itemId);
  if (!item) {
    throw new Error("Order item not found.");
  }

  if (updateData.quantity !== undefined) {
    if (updateData.quantity < item.submittedQuantity) {
      throw new Error(
        `Cannot reduce quantity to ${updateData.quantity}. ${item.submittedQuantity} unit(s) have already been submitted to the kitchen.`
      );
    }
    item.quantity = updateData.quantity;
    item.itemTotal = Math.round(item.price * item.quantity * 100) / 100;
  }

  if (updateData.notes !== undefined) {
    item.notes = updateData.notes;
  }

  const { subtotal, tax, discount, grandTotal } = calculateOrderTotals(
    order.items,
    order.discount
  );
  order.subtotal = subtotal;
  order.tax = tax;
  order.discount = discount;
  order.grandTotal = grandTotal;

  await order.save();

  emitToRestaurant(restaurantId, "order:updated", { order });

  return order;
};

export const deleteOrderItem = async (
  restaurantId: string,
  orderId: string,
  itemId: string,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(orderId) || !Types.ObjectId.isValid(itemId)) {
    throw new Error("Invalid ID format.");
  }

  const order = await Order.findOne({ _id: orderId, restaurantId });
  if (!order) {
    throw new Error("Order not found.");
  }

  if (["COMPLETED", "BILLED", "CANCELLED"].includes(order.status)) {
    throw new Error(`Cannot delete items on order in '${order.status}' status.`);
  }

  const item = (order.items as any).id(itemId);
  if (!item) {
    throw new Error("Order item not found.");
  }

  if (item.submittedQuantity > 0) {
    // If already sent to kitchen, mark status CANCELLED instead of erasing to preserve kitchen audit
    item.status = "CANCELLED";
  } else {
    // Unsubmitted items can be safely removed
    item.deleteOne();
  }

  const { subtotal, tax, discount, grandTotal } = calculateOrderTotals(
    order.items,
    order.discount
  );
  order.subtotal = subtotal;
  order.tax = tax;
  order.discount = discount;
  order.grandTotal = grandTotal;

  await order.save();

  emitToRestaurant(restaurantId, "order:updated", { order });

  await logSecurityEvent({
    actorId,
    action: "ORDER_ITEM_REMOVED",
    entityType: "Order",
    entityId: orderId,
    restaurantId,
    metadata: { itemId, itemName: item.name },
  });

  return order;
};

export const cancelOrder = async (
  restaurantId: string,
  orderId: string,
  reason: string,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(orderId)) {
    throw new Error("Invalid order ID format.");
  }

  const order = await Order.findOne({ _id: orderId, restaurantId });
  if (!order) {
    throw new Error("Order not found.");
  }

  if (order.status === "BILLED" || order.status === "COMPLETED") {
    throw new Error(
      "Cannot cancel an order that has already been billed or paid. Please initiate a formal refund workflow."
    );
  }

  order.status = "CANCELLED";
  await order.save();

  // Cancel any active KOTs for this order
  await KOT.updateMany(
    {
      restaurantId: new Types.ObjectId(restaurantId),
      orderId: order._id,
      kitchenStatus: { $in: ["PENDING", "ACCEPTED", "PREPARING"] },
    },
    { kitchenStatus: "CANCELLED" }
  );

  // Free table if dine-in
  if (order.tableId) {
    const otherActive = await Order.findOne({
      restaurantId,
      tableId: order.tableId,
      _id: { $ne: order._id },
      status: { $in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "BILLED"] },
    });

    if (!otherActive) {
      await RestaurantTable.findByIdAndUpdate(order.tableId, { status: "AVAILABLE" });
      emitToRestaurant(restaurantId, "table:status-updated", {
        tableId: order.tableId.toString(),
        status: "AVAILABLE",
      });
    }
  }

  emitToRestaurant(restaurantId, "order:cancelled", {
    orderId,
    orderNumber: order.orderNumber,
    reason,
  });
  emitToRestaurant(restaurantId, "kot:cancelled", {
    orderId,
    reason,
  });

  await logSecurityEvent({
    actorId,
    action: "ORDER_CANCELLED",
    entityType: "Order",
    entityId: orderId,
    restaurantId,
    metadata: { orderNumber: order.orderNumber, reason },
  });

  return order;
};

// -------------------------------------------------------------
// 2. KOT GENERATION & MANAGEMENT
// -------------------------------------------------------------

export const generateKOT = async (
  restaurantId: string,
  orderId: string,
  options: { priority?: KOTPriority; idempotencyKey?: string },
  actorId: string
) => {
  if (!Types.ObjectId.isValid(orderId)) {
    throw new Error("Invalid order ID format.");
  }

  const restObjectId = new Types.ObjectId(restaurantId);

  // Idempotency check: prevent duplicate KOT creation
  if (options.idempotencyKey) {
    const existing = await KOT.findOne({
      restaurantId: restObjectId,
      idempotencyKey: options.idempotencyKey.trim(),
    });
    if (existing) {
      return existing;
    }
  }

  const order = await Order.findOne({ _id: orderId, restaurantId }).populate(
    "tableId",
    "tableNumber floor"
  );
  if (!order) {
    throw new Error("Order not found.");
  }

  if (["COMPLETED", "BILLED", "CANCELLED"].includes(order.status)) {
    throw new Error(`Cannot generate KOT for order in '${order.status}' status.`);
  }

  // Find active items that have unsubmitted quantities
  const unprintedItems = order.items.filter(
    (i) => i.status === "ACTIVE" && i.quantity > (i.submittedQuantity || 0)
  );

  if (unprintedItems.length === 0) {
    throw new Error(
      "No new or unsubmitted items found in this order. All items have already been sent to the kitchen."
    );
  }

  const kotItems = unprintedItems.map((item) => ({
    menuItemId: item.menuItemId,
    name: item.name,
    quantity: item.quantity - (item.submittedQuantity || 0),
    notes: item.notes,
    status: "PENDING" as const,
  }));

  const tableNumber = (order.tableId as any)?.tableNumber || "Takeaway/Delivery";

  let kot: any;
  let attempts = 0;
  while (!kot && attempts < 5) {
    attempts++;
    const kotNumber = await generateKOTNumber(restaurantId);
    try {
      kot = await KOT.create({
        restaurantId: restObjectId,
        orderId: order._id,
        kotNumber,
        orderNumber: order.orderNumber,
        tableNumber,
        items: kotItems,
        kitchenStatus: "PENDING",
        priority: options.priority || "MEDIUM",
        idempotencyKey: options.idempotencyKey,
      });
    } catch (createErr: any) {
      if (createErr.code === 11000) {
        continue; // collision occurred, retry with next incremented sequence number
      }
      throw createErr;
    }
  }

  if (!kot) {
    throw new Error("Failed to generate a unique KOT number. Please try again.");
  }

  // Update submittedQuantity for each order line item
  for (const item of unprintedItems) {
    item.submittedQuantity = item.quantity;
  }

  // Update order status to PREPARING if it was CONFIRMED or PENDING
  if (["PENDING", "CONFIRMED"].includes(order.status)) {
    order.status = "PREPARING";
  }

  await order.save();

  // Real-time broadcasts
  emitToRestaurant(restaurantId, "kot:created", {
    kot,
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    tableNumber,
    items: kotItems,
    timestamp: new Date().toISOString(),
  });
  emitToRestaurant(restaurantId, "order:updated", { order });

  await logSecurityEvent({
    actorId,
    action: "KOT_GENERATED",
    entityType: "KOT",
    entityId: kot._id.toString(),
    restaurantId,
    metadata: {
      kotNumber: kot.kotNumber,
      orderNumber: order.orderNumber,
      itemCount: kot.items.length,
      priority: kot.priority,
    },
  });

  return kot;
};

export const getKOTs = async (
  restaurantId: string,
  params: { orderId?: string; kitchenStatus?: string; page?: number; limit?: number }
) => {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const query: any = { restaurantId: new Types.ObjectId(restaurantId) };
  if (params.orderId && Types.ObjectId.isValid(params.orderId)) query.orderId = params.orderId;
  if (params.kitchenStatus) query.kitchenStatus = params.kitchenStatus;

  const [kots, total] = await Promise.all([
    KOT.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    KOT.countDocuments(query),
  ]);

  return {
    kots,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getKOTById = async (restaurantId: string, kotId: string) => {
  if (!Types.ObjectId.isValid(kotId)) {
    throw new Error("Invalid KOT ID format.");
  }

  const kot = await KOT.findOne({ _id: kotId, restaurantId }).populate(
    "orderId",
    "orderNumber orderType tableId customerId status"
  );
  if (!kot) {
    throw new Error("KOT not found.");
  }
  return kot;
};

// -------------------------------------------------------------
// 3. KITCHEN DISPLAY SYSTEM (KDS)
// -------------------------------------------------------------

export const getKitchenOrders = async (restaurantId: string) => {
  // Sort oldest pending orders first for efficient kitchen FIFO throughput
  const activeKots = await KOT.find({
    restaurantId: new Types.ObjectId(restaurantId),
    kitchenStatus: { $in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] },
  })
    .sort({ createdAt: 1 })
    .lean();

  const now = Date.now();
  return activeKots.map((kot) => ({
    ...kot,
    elapsedMinutes: Math.floor((now - new Date(kot.createdAt).getTime()) / 60000),
  }));
};

export const updateKOTStatus = async (
  restaurantId: string,
  kotId: string,
  newStatus: KitchenStatus,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(kotId)) {
    throw new Error("Invalid KOT ID format.");
  }

  const kot = await KOT.findOne({ _id: kotId, restaurantId });
  if (!kot) {
    throw new Error("KOT not found.");
  }

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

  const allowed = validTransitions[kot.kitchenStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid kitchen status transition: Cannot transition from '${kot.kitchenStatus}' to '${newStatus}'.`
    );
  }

  const now = new Date();
  kot.kitchenStatus = newStatus;

  if (newStatus === "ACCEPTED") kot.acceptedAt = now;
  if (newStatus === "PREPARING") kot.startedAt = now;
  if (newStatus === "READY") kot.readyAt = now;
  if (newStatus === "COMPLETED" || newStatus === "SERVED") kot.completedAt = now;

  await kot.save();

  // Real-time broadcast
  emitToRestaurant(restaurantId, "kot:updated", { kot });

  if (newStatus === "READY") {
    emitToRestaurant(restaurantId, "kitchen:order-ready", {
      kotId: kot._id.toString(),
      kotNumber: kot.kotNumber,
      orderNumber: kot.orderNumber,
      tableNumber: kot.tableNumber,
    });
  }

  // Synchronize Order status: If all active KOTs for the order are READY or COMPLETED, update Order.status
  const allKots = await KOT.find({ orderId: kot.orderId, restaurantId });
  const allReady = allKots.every((k) =>
    ["READY", "SERVED", "COMPLETED", "CANCELLED"].includes(k.kitchenStatus)
  );

  if (allReady && newStatus === "READY") {
    await Order.findByIdAndUpdate(kot.orderId, { status: "READY" });
    emitToRestaurant(restaurantId, "order:updated", {
      orderId: kot.orderId,
      status: "READY",
    });
  }

  await logSecurityEvent({
    actorId,
    action: "KOT_STATUS_CHANGED",
    entityType: "KOT",
    entityId: kotId,
    restaurantId,
    metadata: { kotNumber: kot.kotNumber, newStatus },
  });

  return kot;
};

// -------------------------------------------------------------
// 4. THERMAL KOT PRINTING FORMATTER (58mm / 80mm)
// -------------------------------------------------------------

export const formatKOTPrint = async (
  restaurantId: string,
  kotId: string,
  paperWidth: "58mm" | "80mm" = "80mm"
) => {
  const [kot, restaurant] = await Promise.all([
    KOT.findOne({ _id: kotId, restaurantId }),
    Restaurant.findById(restaurantId),
  ]);

  if (!kot) throw new Error("KOT not found.");
  if (!restaurant) throw new Error("Restaurant not found.");

  const lineWidth = paperWidth === "58mm" ? 32 : 48;
  const divider = "-".repeat(lineWidth);
  const doubleDivider = "=".repeat(lineWidth);

  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((lineWidth - text.length) / 2));
    return " ".repeat(pad) + text;
  };

  const row = (col1: string, col2: string) => {
    const spaces = Math.max(1, lineWidth - col1.length - col2.length);
    return col1 + " ".repeat(spaces) + col2;
  };

  const dateStr = new Date(kot.createdAt).toLocaleString("en-IN", {
    timeZone: restaurant.timezone || "Asia/Kolkata",
  });

  const lines: string[] = [
    doubleDivider,
    center(restaurant.name.toUpperCase()),
    center("KITCHEN ORDER TICKET (KOT)"),
    doubleDivider,
    row(`KOT: ${kot.kotNumber}`, `PRIORITY: ${kot.priority}`),
    row(`ORDER: ${kot.orderNumber || "N/A"}`, `TABLE: ${kot.tableNumber || "N/A"}`),
    row("TIME:", dateStr),
    divider,
    paperWidth === "58mm" ? row("QTY  ITEM", "") : row("QTY  ITEM DESCRIPTION", "NOTES"),
    divider,
  ];

  for (const item of kot.items) {
    const qtyStr = String(item.quantity).padStart(3, " ") + "  ";
    lines.push(`${qtyStr}${item.name}`);
    if (item.notes) {
      lines.push(`     * NOTES: ${item.notes}`);
    }
  }

  lines.push(divider);
  lines.push(center(`STATUS: ${kot.kitchenStatus}`));
  lines.push(doubleDivider);
  lines.push("\n\n"); // Feed paper

  return {
    rawText: lines.join("\n"),
    paperWidth,
    lineWidth,
    kotNumber: kot.kotNumber,
    orderNumber: kot.orderNumber,
    tableNumber: kot.tableNumber,
    createdAt: kot.createdAt,
    itemCount: kot.items.length,
  };
};
