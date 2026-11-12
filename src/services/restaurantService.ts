import { Types } from "mongoose";
import { Restaurant } from "../models/Restaurant";
import { Staff } from "../models/Staff";
import { RestaurantTable } from "../models/RestaurantTable";
import { MenuCategory } from "../models/MenuCategory";
import { MenuItem } from "../models/MenuItem";
import { Order } from "../models/Order";
import { KOT } from "../models/KOT";
import { Invoice } from "../models/Invoice";
import { InventoryItem } from "../models/InventoryItem";
import { hashPassword } from "../utils/password";
import { DEFAULT_ROLE_PERMISSIONS } from "../utils/permissions";
import { checkPlanLimit } from "../middleware/subscriptionCheck";
import { emitToRestaurant } from "./socketService";
import { logSecurityEvent } from "./auditService";

// -------------------------------------------------------------
// 1. RESTAURANT DASHBOARD
// -------------------------------------------------------------

export const getDashboardMetrics = async (restaurantId: string) => {
  const restObjectId = new Types.ObjectId(restaurantId);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [
    todaysOrders,
    todaysCompletedOrders,
    salesResult,
    activeTables,
    pendingKotCount,
    totalMenuItems,
    activeStaff,
    lowStockAlerts,
  ] = await Promise.all([
    Order.countDocuments({
      restaurantId: restObjectId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }),
    Order.countDocuments({
      restaurantId: restObjectId,
      status: "COMPLETED",
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }),
    Invoice.aggregate([
      {
        $match: {
          restaurantId: restObjectId,
          paymentStatus: "PAID",
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$grandTotal" },
        },
      },
    ]),
    RestaurantTable.countDocuments({
      restaurantId: restObjectId,
      status: "OCCUPIED",
    }),
    KOT.countDocuments({
      restaurantId: restObjectId,
      kitchenStatus: { $in: ["PENDING", "IN_PROGRESS"] },
    }),
    MenuItem.countDocuments({
      restaurantId: restObjectId,
      availability: true,
    }),
    Staff.countDocuments({
      restaurantId: restObjectId,
      status: "ACTIVE",
    }),
    InventoryItem.countDocuments({
      restaurantId: restObjectId,
      $expr: { $lte: ["$currentStock", "$minimumStock"] },
    }),
  ]);

  const todaysVerifiedSales =
    salesResult.length > 0 && salesResult[0].totalSales
      ? salesResult[0].totalSales
      : 0;

  return {
    todaysOrders,
    todaysCompletedOrders,
    todaysVerifiedSales,
    activeTables,
    pendingKotCount,
    totalMenuItems,
    activeStaff,
    lowStockAlerts,
  };
};

// -------------------------------------------------------------
// 2. PROFILE MANAGEMENT
// -------------------------------------------------------------

export const getRestaurantProfile = async (restaurantId: string) => {
  const restaurant = await Restaurant.findById(restaurantId)
    .populate({
      path: "subscriptionId",
      populate: { path: "planId", select: "name price billingCycle limits features" },
    })
    .lean();

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }
  return restaurant;
};

export const updateRestaurantProfile = async (
  restaurantId: string,
  updateData: any,
  actorId: string
) => {
  const safeData = { ...updateData };
  delete safeData._id;
  delete safeData.slug; // Immutable tenant slug
  delete safeData.subscriptionId; // Cannot self-assign subscriptions
  delete safeData.status; // Cannot self-modify status
  delete safeData.createdAt;

  const updated = await Restaurant.findByIdAndUpdate(restaurantId, safeData, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    throw new Error("Restaurant not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "PROFILE_UPDATED",
    entityType: "Restaurant",
    entityId: restaurantId,
    restaurantId,
    metadata: { updatedFields: Object.keys(safeData) },
  });

  return updated;
};

// -------------------------------------------------------------
// 3. STAFF MANAGEMENT
// -------------------------------------------------------------

export const createStaffMember = async (
  restaurantId: string,
  data: any,
  actorId: string,
  actorRole: string
) => {
  // Prevent privilege escalation: only ADMIN or SUPER_ADMIN can create staff
  if (actorRole !== "ADMIN" && actorRole !== "SUPER_ADMIN") {
    throw new Error("Forbidden: Only restaurant administrators can create staff accounts.");
  }

  // Enforce plan quota on staff
  const currentStaffCount = await Staff.countDocuments({
    restaurantId,
    status: { $ne: "SUSPENDED" },
  });
  const limitCheck = await checkPlanLimit(restaurantId, "maxStaff", currentStaffCount);
  if (!limitCheck.allowed) {
    throw new Error(
      `Plan staff quota exceeded: Your subscription tier allows a maximum of ${limitCheck.max} staff members.`
    );
  }

  const email = data.email.toLowerCase().trim();
  const existing = await Staff.findOne({ email });
  if (existing) {
    throw new Error(`A staff account with email '${email}' already exists.`);
  }

  const hashedPassword = await hashPassword(data.password);
  const permissions =
    data.permissions && data.permissions.length > 0
      ? data.permissions
      : DEFAULT_ROLE_PERMISSIONS[data.role] || [];

  const staff = await Staff.create({
    restaurantId: new Types.ObjectId(restaurantId),
    name: data.name,
    email,
    phone: data.phone,
    passwordHash: hashedPassword,
    role: data.role,
    permissions,
    status: "ACTIVE",
  });

  await logSecurityEvent({
    actorId,
    action: "STAFF_CREATED",
    entityType: "Staff",
    entityId: staff._id.toString(),
    restaurantId,
    metadata: { staffEmail: staff.email, role: staff.role },
  });

  // Return clean staff object without password hash
  return {
    id: staff._id.toString(),
    name: staff.name,
    email: staff.email,
    phone: staff.phone,
    role: staff.role,
    permissions: staff.permissions,
    status: staff.status,
    createdAt: staff.createdAt,
  };
};

export const getStaffList = async (
  restaurantId: string,
  params: { search?: string; role?: string; status?: string; page?: number; limit?: number }
) => {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const query: any = { restaurantId: new Types.ObjectId(restaurantId) };
  if (params.role) query.role = params.role;
  if (params.status) query.status = params.status;
  if (params.search) {
    const regex = new RegExp(params.search.trim(), "i");
    query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const [staff, total] = await Promise.all([
    Staff.find(query)
      .select("name email phone role permissions status createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Staff.countDocuments(query),
  ]);

  return {
    staff,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getStaffById = async (restaurantId: string, staffId: string) => {
  if (!Types.ObjectId.isValid(staffId)) {
    throw new Error("Invalid staff ID format.");
  }
  const staff = await Staff.findOne({
    _id: staffId,
    restaurantId,
  }).select("name email phone role permissions status createdAt");

  if (!staff) {
    throw new Error("Staff member not found in this restaurant.");
  }
  return staff;
};

export const updateStaffMember = async (
  restaurantId: string,
  staffId: string,
  updateData: any,
  actorId: string,
  actorRole: string
) => {
  if (!Types.ObjectId.isValid(staffId)) {
    throw new Error("Invalid staff ID format.");
  }

  // Prevent users from changing their own role
  if (staffId === actorId && updateData.role) {
    throw new Error("Forbidden: You cannot modify your own role.");
  }

  // Prevent privilege escalation
  if (updateData.role && actorRole !== "ADMIN" && actorRole !== "SUPER_ADMIN") {
    throw new Error("Forbidden: Only administrators can modify staff roles.");
  }

  const safeData = { ...updateData };
  delete safeData.password;
  delete safeData.passwordHash;
  delete safeData.restaurantId;

  const staff = await Staff.findOneAndUpdate(
    { _id: staffId, restaurantId },
    safeData,
    { new: true, runValidators: true }
  ).select("name email phone role permissions status updatedAt");

  if (!staff) {
    throw new Error("Staff member not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "STAFF_UPDATED",
    entityType: "Staff",
    entityId: staffId,
    restaurantId,
    metadata: { updatedFields: Object.keys(safeData) },
  });

  return staff;
};

export const updateStaffStatus = async (
  restaurantId: string,
  staffId: string,
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED",
  actorId: string
) => {
  if (!Types.ObjectId.isValid(staffId)) {
    throw new Error("Invalid staff ID format.");
  }
  if (staffId === actorId) {
    throw new Error("Forbidden: You cannot change your own account status.");
  }

  const staff = await Staff.findOneAndUpdate(
    { _id: staffId, restaurantId },
    { status },
    { new: true }
  ).select("name email role status updatedAt");

  if (!staff) {
    throw new Error("Staff member not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "STAFF_STATUS_CHANGED",
    entityType: "Staff",
    entityId: staffId,
    restaurantId,
    metadata: { status },
  });

  return staff;
};

// -------------------------------------------------------------
// 4. RESTAURANT TABLE MANAGEMENT
// -------------------------------------------------------------

export const createTable = async (restaurantId: string, data: any, actorId: string) => {
  // Check plan table quota
  const currentCount = await RestaurantTable.countDocuments({ restaurantId });
  const limitCheck = await checkPlanLimit(restaurantId, "maxTables", currentCount);
  if (!limitCheck.allowed) {
    throw new Error(
      `Plan table quota exceeded: Your subscription tier allows a maximum of ${limitCheck.max} tables.`
    );
  }

  const tableNumber = data.tableNumber.trim();
  const existing = await RestaurantTable.findOne({ restaurantId, tableNumber });
  if (existing) {
    throw new Error(`Table number '${tableNumber}' already exists in your restaurant.`);
  }

  const table = await RestaurantTable.create({
    restaurantId: new Types.ObjectId(restaurantId),
    tableNumber,
    capacity: data.capacity,
    floor: data.floor || "Main Dining",
    status: data.status || "AVAILABLE",
  });

  emitToRestaurant(restaurantId, "table:created", { table });

  await logSecurityEvent({
    actorId,
    action: "TABLE_CREATED",
    entityType: "RestaurantTable",
    entityId: table._id.toString(),
    restaurantId,
    metadata: { tableNumber: table.tableNumber, capacity: table.capacity },
  });

  return table;
};

export const getTables = async (restaurantId: string, filters: { floor?: string; status?: string }) => {
  const query: any = { restaurantId: new Types.ObjectId(restaurantId) };
  if (filters.floor) query.floor = filters.floor;
  if (filters.status) query.status = filters.status;

  return RestaurantTable.find(query).sort({ tableNumber: 1 });
};

export const getTableById = async (restaurantId: string, tableId: string) => {
  if (!Types.ObjectId.isValid(tableId)) {
    throw new Error("Invalid table ID format.");
  }
  const table = await RestaurantTable.findOne({ _id: tableId, restaurantId });
  if (!table) {
    throw new Error("Table not found.");
  }
  return table;
};

export const updateTable = async (
  restaurantId: string,
  tableId: string,
  updateData: any,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(tableId)) {
    throw new Error("Invalid table ID format.");
  }

  if (updateData.tableNumber) {
    const existing = await RestaurantTable.findOne({
      restaurantId,
      tableNumber: updateData.tableNumber.trim(),
      _id: { $ne: tableId },
    });
    if (existing) {
      throw new Error(`Table number '${updateData.tableNumber}' already exists.`);
    }
  }

  const table = await RestaurantTable.findOneAndUpdate(
    { _id: tableId, restaurantId },
    updateData,
    { new: true, runValidators: true }
  );

  if (!table) {
    throw new Error("Table not found.");
  }

  // Real-time notification
  emitToRestaurant(restaurantId, "table:updated", { table });
  if (updateData.status) {
    emitToRestaurant(restaurantId, "table:status_changed", {
      tableId,
      status: table.status,
    });
  }

  await logSecurityEvent({
    actorId,
    action: "TABLE_UPDATED",
    entityType: "RestaurantTable",
    entityId: tableId,
    restaurantId,
    metadata: { updatedFields: Object.keys(updateData) },
  });

  return table;
};

export const deleteTable = async (restaurantId: string, tableId: string, actorId: string) => {
  if (!Types.ObjectId.isValid(tableId)) {
    throw new Error("Invalid table ID format.");
  }

  // Prevent deleting table if active order exists
  const activeOrder = await Order.findOne({
    restaurantId: new Types.ObjectId(restaurantId),
    tableId: new Types.ObjectId(tableId),
    status: { $in: ["PENDING", "CONFIRMED", "PLACED", "PREPARING", "READY", "SERVED", "BILLED"] },
  });

  if (activeOrder) {
    throw new Error("Cannot delete table: Table is currently associated with an active order.");
  }

  const table = await RestaurantTable.findOneAndDelete({ _id: tableId, restaurantId });
  if (!table) {
    throw new Error("Table not found.");
  }

  emitToRestaurant(restaurantId, "table:deleted", { tableId });

  await logSecurityEvent({
    actorId,
    action: "TABLE_DELETED",
    entityType: "RestaurantTable",
    entityId: tableId,
    restaurantId,
    metadata: { tableNumber: table.tableNumber },
  });

  return table;
};

// -------------------------------------------------------------
// 5. MENU CATEGORY MANAGEMENT
// -------------------------------------------------------------

export const createCategory = async (restaurantId: string, data: any, actorId: string) => {
  const name = data.name.trim();
  const existing = await MenuCategory.findOne({ restaurantId, name });
  if (existing) {
    throw new Error(`Menu category '${name}' already exists.`);
  }

  const category = await MenuCategory.create({
    restaurantId: new Types.ObjectId(restaurantId),
    name,
    description: data.description,
    sortOrder: data.sortOrder || 0,
    status: data.status || "ACTIVE",
  });

  await logSecurityEvent({
    actorId,
    action: "CATEGORY_CREATED",
    entityType: "MenuCategory",
    entityId: category._id.toString(),
    restaurantId,
    metadata: { name: category.name },
  });

  return category;
};

export const getCategories = async (restaurantId: string) => {
  return MenuCategory.find({ restaurantId: new Types.ObjectId(restaurantId) }).sort({
    sortOrder: 1,
    name: 1,
  });
};

export const updateCategory = async (
  restaurantId: string,
  categoryId: string,
  updateData: any,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new Error("Invalid category ID format.");
  }

  if (updateData.name) {
    const existing = await MenuCategory.findOne({
      restaurantId,
      name: updateData.name.trim(),
      _id: { $ne: categoryId },
    });
    if (existing) {
      throw new Error(`A category named '${updateData.name}' already exists.`);
    }
  }

  const category = await MenuCategory.findOneAndUpdate(
    { _id: categoryId, restaurantId },
    updateData,
    { new: true, runValidators: true }
  );

  if (!category) {
    throw new Error("Category not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "CATEGORY_UPDATED",
    entityType: "MenuCategory",
    entityId: categoryId,
    restaurantId,
    metadata: { updatedFields: Object.keys(updateData) },
  });

  return category;
};

export const deleteCategory = async (restaurantId: string, categoryId: string, actorId: string) => {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new Error("Invalid category ID format.");
  }

  // Prevent deleting categories linked to menu items
  const linkedItemsCount = await MenuItem.countDocuments({ restaurantId, categoryId });
  if (linkedItemsCount > 0) {
    throw new Error(
      `Cannot delete category: ${linkedItemsCount} menu items are currently linked to it. Please reassign or delete the items first.`
    );
  }

  const category = await MenuCategory.findOneAndDelete({ _id: categoryId, restaurantId });
  if (!category) {
    throw new Error("Category not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "CATEGORY_DELETED",
    entityType: "MenuCategory",
    entityId: categoryId,
    restaurantId,
    metadata: { name: category.name },
  });

  return category;
};

// -------------------------------------------------------------
// 6. MENU ITEM MANAGEMENT
// -------------------------------------------------------------

export const createMenuItem = async (restaurantId: string, data: any, actorId: string) => {
  // Check subscription limit
  const currentCount = await MenuItem.countDocuments({ restaurantId });
  const limitCheck = await checkPlanLimit(restaurantId, "maxMenuItems", currentCount);
  if (!limitCheck.allowed) {
    throw new Error(
      `Plan menu items quota exceeded: Your subscription tier allows a maximum of ${limitCheck.max} menu items.`
    );
  }

  // Validate that referenced category belongs to the SAME restaurant
  const category = await MenuCategory.findOne({
    _id: data.categoryId,
    restaurantId,
  });
  if (!category) {
    throw new Error("Invalid category: The specified category does not belong to your restaurant.");
  }

  const item = await MenuItem.create({
    restaurantId: new Types.ObjectId(restaurantId),
    categoryId: category._id,
    name: data.name.trim(),
    description: data.description,
    price: data.price,
    taxRate: data.taxRate !== undefined ? data.taxRate : 5,
    image: data.image,
    preparationTime: data.preparationTime || 15,
    availability: data.availability !== undefined ? data.availability : true,
    isVegetarian: data.isVegetarian !== undefined ? data.isVegetarian : true,
  });

  emitToRestaurant(restaurantId, "menu:item_created", { item });

  await logSecurityEvent({
    actorId,
    action: "MENU_ITEM_CREATED",
    entityType: "MenuItem",
    entityId: item._id.toString(),
    restaurantId,
    metadata: { name: item.name, price: item.price },
  });

  return item;
};

export const getMenuItems = async (
  restaurantId: string,
  params: {
    search?: string;
    categoryId?: string;
    availability?: string;
    isVegetarian?: string;
    page?: number;
    limit?: number;
  }
) => {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const query: any = { restaurantId: new Types.ObjectId(restaurantId) };
  if (params.categoryId && Types.ObjectId.isValid(params.categoryId)) {
    query.categoryId = params.categoryId;
  }
  if (params.availability !== undefined && params.availability !== "") {
    query.availability = params.availability === "true";
  }
  if (params.isVegetarian !== undefined && params.isVegetarian !== "") {
    query.isVegetarian = params.isVegetarian === "true";
  }
  if (params.search) {
    query.name = new RegExp(params.search.trim(), "i");
  }

  const [items, total] = await Promise.all([
    MenuItem.find(query)
      .populate("categoryId", "name sortOrder")
      .sort({ categoryId: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MenuItem.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getMenuItemById = async (restaurantId: string, itemId: string) => {
  if (!Types.ObjectId.isValid(itemId)) {
    throw new Error("Invalid menu item ID format.");
  }
  const item = await MenuItem.findOne({ _id: itemId, restaurantId }).populate(
    "categoryId",
    "name sortOrder"
  );
  if (!item) {
    throw new Error("Menu item not found.");
  }
  return item;
};

export const updateMenuItem = async (
  restaurantId: string,
  itemId: string,
  updateData: any,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(itemId)) {
    throw new Error("Invalid menu item ID format.");
  }

  // If categoryId updated, verify it belongs to this restaurant
  if (updateData.categoryId) {
    const category = await MenuCategory.findOne({
      _id: updateData.categoryId,
      restaurantId,
    });
    if (!category) {
      throw new Error("Specified category does not belong to your restaurant.");
    }
  }

  const item = await MenuItem.findOneAndUpdate(
    { _id: itemId, restaurantId },
    updateData,
    { new: true, runValidators: true }
  ).populate("categoryId", "name sortOrder");

  if (!item) {
    throw new Error("Menu item not found.");
  }

  // Real-time broadcast if availability changed
  if (updateData.availability !== undefined) {
    emitToRestaurant(restaurantId, "menu:availability_changed", {
      menuItemId: itemId,
      availability: item.availability,
    });
  }

  await logSecurityEvent({
    actorId,
    action: "MENU_ITEM_UPDATED",
    entityType: "MenuItem",
    entityId: itemId,
    restaurantId,
    metadata: { updatedFields: Object.keys(updateData) },
  });

  return item;
};

export const deleteMenuItem = async (restaurantId: string, itemId: string, actorId: string) => {
  if (!Types.ObjectId.isValid(itemId)) {
    throw new Error("Invalid menu item ID format.");
  }

  // Check if item is referenced in historical orders
  const referencedInOrders = await Order.findOne({
    restaurantId,
    "items.menuItemId": itemId,
  });

  if (referencedInOrders) {
    // Non-destructive soft removal: Archive and mark unavailable to protect billing & audit integrity
    const item = await MenuItem.findOneAndUpdate(
      { _id: itemId, restaurantId },
      { availability: false },
      { new: true }
    );
    emitToRestaurant(restaurantId, "menu:availability_changed", {
      menuItemId: itemId,
      availability: false,
    });

    await logSecurityEvent({
      actorId,
      action: "MENU_ITEM_ARCHIVED",
      entityType: "MenuItem",
      entityId: itemId,
      restaurantId,
      metadata: { reason: "Item is referenced by historical orders; archived instead of hard-deleted." },
    });

    return {
      archived: true,
      message: "Item is referenced by order history. It has been archived and marked unavailable to preserve financial records.",
      item,
    };
  }

  const deleted = await MenuItem.findOneAndDelete({ _id: itemId, restaurantId });
  if (!deleted) {
    throw new Error("Menu item not found.");
  }

  emitToRestaurant(restaurantId, "menu:item_deleted", { menuItemId: itemId });

  await logSecurityEvent({
    actorId,
    action: "MENU_ITEM_DELETED",
    entityType: "MenuItem",
    entityId: itemId,
    restaurantId,
    metadata: { name: deleted.name },
  });

  return { archived: false, message: "Menu item deleted successfully.", item: deleted };
};

