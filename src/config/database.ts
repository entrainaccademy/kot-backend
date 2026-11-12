import mongoose from "mongoose";

export const connectDB = async (): Promise<boolean> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("MongoDB connection warning: MONGODB_URI is not defined in environment variables.");
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected successfully to host: ${conn.connection.host}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const sanitizedError = errorMessage.replace(/\/\/[^@]+@/, "//***:***@");
    console.error(`MongoDB connection error: ${sanitizedError}`);
    return false;
  }
};

export const getDbStatus = (): "connected" | "connecting" | "disconnected" => {
  switch (mongoose.connection.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    default:
      return "disconnected";
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("MongoDB connection closed.");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error closing MongoDB connection: ${errorMessage}`);
  }
};
