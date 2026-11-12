import mongoose from "mongoose";

// Setup event listeners for connection resilience
mongoose.connection.on("connected", () => {
  console.log("MongoDB connection established successfully.");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB runtime connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection lost. Reconnection will be attempted...");
});

export const connectDB = async (retryCount = 0): Promise<boolean> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("MongoDB connection warning: MONGODB_URI is not defined in environment variables.");
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB connected successfully to host: ${conn.connection.host}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const sanitizedError = errorMessage.replace(/\/\/[^@]+@/, "//***:***@");
    console.error(`MongoDB connection error: ${sanitizedError}`);

    // Automatically retry if initial connection failed
    if (retryCount < 3) {
      console.log(`Retrying MongoDB connection in 2 seconds... (Attempt ${retryCount + 1}/3)`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return connectDB(retryCount + 1);
    }
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
