import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/database";
import { SuperAdmin } from "../models/SuperAdmin";
import { hashPassword } from "../utils/password";
import { provisionSuperAdminSchema } from "../validators/authValidators";

const seedInitialSuperAdmin = async () => {
  const name = process.env.INITIAL_SUPERADMIN_NAME || process.argv[2];
  const email = process.env.INITIAL_SUPERADMIN_EMAIL || process.argv[3];
  const password = process.env.INITIAL_SUPERADMIN_PASSWORD || process.argv[4];

  if (!name || !email || !password) {
    console.error("Usage: Provide INITIAL_SUPERADMIN_NAME, INITIAL_SUPERADMIN_EMAIL, and INITIAL_SUPERADMIN_PASSWORD via environment variables or CLI arguments:");
    console.error("npm run seed:superadmin <name> <email> <password>");
    process.exit(1);
  }

  // Validate credentials against schema
  const validationResult = provisionSuperAdminSchema.safeParse({ name, email, password });
  if (!validationResult.success) {
    console.error("Validation failed:");
    validationResult.error.issues.forEach((issue) => {
      console.error(`- ${issue.message}`);
    });
    process.exit(1);
  }

  const isConnected = await connectDB();
  if (!isConnected) {
    console.error("Cannot seed SuperAdmin: Database connection failed.");
    process.exit(1);
  }

  try {
    const existing = await SuperAdmin.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log(`SuperAdmin with email '${email}' already exists. Skipping creation.`);
      await disconnectDB();
      process.exit(0);
    }

    const hashedPassword = await hashPassword(password);
    const superAdmin = await SuperAdmin.create({
      name,
      email: email.toLowerCase().trim(),
      passwordHash: hashedPassword,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    console.log(`SuperAdmin created successfully: ID=${superAdmin._id}, Email=${superAdmin.email}`);
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error("Error creating SuperAdmin:", error);
    await disconnectDB();
    process.exit(1);
  }
};

seedInitialSuperAdmin();

