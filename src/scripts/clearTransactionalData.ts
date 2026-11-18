import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

// Load backend .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function clearTransactionalData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Error: MONGODB_URI is not set in backend/.env");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  const db = mongoose.connection.db;
  if (!db) {
    console.error("Database connection failed");
    process.exit(1);
  }

  console.log(`Connected to database: ${mongoose.connection.name}`);

  // Collections to clear
  const orderCol = db.collection("orders");
  const kotCol = db.collection("kots");
  const invoiceCol = db.collection("invoices");
  const paymentCol = db.collection("payments");
  const tableCol = db.collection("restauranttables");

  // Get counts before
  const ordersCount = await orderCol.countDocuments();
  const kotsCount = await kotCol.countDocuments();
  const invoicesCount = await invoiceCol.countDocuments();
  const paymentsCount = await paymentCol.countDocuments();
  const tablesCount = await tableCol.countDocuments();
  const occupiedTablesCount = await tableCol.countDocuments({ status: { $ne: "AVAILABLE" } });

  console.log("\n--- Current Data Before Clearing ---");
  console.log(`Orders: ${ordersCount}`);
  console.log(`KOTs: ${kotsCount}`);
  console.log(`Invoices: ${invoicesCount}`);
  console.log(`Payments: ${paymentsCount}`);
  console.log(`Total Tables: ${tablesCount} (${occupiedTablesCount} currently occupied/reserved)`);

  console.log("\nClearing transactional data...");

  const ordersResult = await orderCol.deleteMany({});
  const kotsResult = await kotCol.deleteMany({});
  const invoicesResult = await invoiceCol.deleteMany({});
  const paymentsResult = await paymentCol.deleteMany({});
  const tablesResult = await tableCol.updateMany({}, { $set: { status: "AVAILABLE" } });

  console.log("\n--- Clearing Results ---");
  console.log(`Deleted Orders: ${ordersResult.deletedCount}`);
  console.log(`Deleted KOTs: ${kotsResult.deletedCount}`);
  console.log(`Deleted Invoices: ${invoicesResult.deletedCount}`);
  console.log(`Deleted Payments: ${paymentsResult.deletedCount}`);
  console.log(`Reset Tables to AVAILABLE: ${tablesResult.modifiedCount}`);

  // Verify non-transactional data remains safe
  const staffCol = db.collection("staffs");
  const menuCol = db.collection("menuitems");
  const catCol = db.collection("menucategories");
  const restCol = db.collection("restaurants");

  console.log("\n--- Preserved Configuration Data ---");
  console.log(`Restaurants: ${await restCol.countDocuments()}`);
  console.log(`Staff Members: ${await staffCol.countDocuments()}`);
  console.log(`Menu Categories: ${await catCol.countDocuments()}`);
  console.log(`Menu Items: ${await menuCol.countDocuments()}`);
  console.log(`Restaurant Tables: ${await tableCol.countDocuments()}`);

  console.log("\nTransactional database cleanup completed successfully!");
  await mongoose.disconnect();
  process.exit(0);
}

clearTransactionalData().catch((err) => {
  console.error("Cleanup script error:", err);
  process.exit(1);
});
