import http from "http";
import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Server, Socket } from "socket.io";
import { connectDB, getDbStatus, disconnectDB } from "./config/database";
import authRoutes from "./routes/authRoutes";
import superAdminRoutes from "./routes/superAdminRoutes";
import adminRoutes from "./routes/adminRoutes";
import restaurantRoutes from "./routes/restaurantRoutes";
import { errorHandler } from "./middleware/errorHandler";
import { socketAuthMiddleware } from "./middleware/socketAuth";
import { setSocketInstance } from "./services/socketService";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Security & Parsing Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));

// Permissive local CORS handler for dev & local network
const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true;
  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("192.168.") ||
    origin.includes("10.") ||
    origin.includes("172.") ||
    origin === FRONTEND_URL
  ) {
    return true;
  }
  // In development, allow the requesting origin
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// Health Check Endpoint
app.get("/api/health", (req: Request, res: Response) => {
  const dbStatus = getDbStatus();
  res.status(200).json({
    success: true,
    message: "KOT Backend Running",
    database: dbStatus,
  });
});

// Mount Application Routes
app.use("/api/auth", authRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/restaurant", restaurantRoutes);

// Centralized Error Handling Middleware
app.use(errorHandler);

// Create HTTP server and attach Socket.IO
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

setSocketInstance(io);

// Protect Socket.IO with JWT Authentication & Tenant Scoping
io.use(socketAuthMiddleware);

// Socket.IO Connection Handling
io.on("connection", (socket: Socket) => {
  const user = socket.data.user;
  console.log(`Socket authenticated & connected: ${socket.id} (User: ${user?.email || "Unknown"})`);

  socket.on("disconnect", (reason: string) => {
    console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
  });
});

// Graceful Shutdown
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  io.close(() => {
    console.log("Socket.IO connections closed.");
  });
  httpServer.close(async () => {
    console.log("HTTP server closed.");
    await disconnectDB();
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forcing shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection in Backend Server:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception in Backend Server:", err);
});

// Start server after connecting to database
const startServer = async () => {
  await connectDB();

  httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Allowed CORS Origin: ${FRONTEND_URL}`);
  });
};

startServer();

export { app, httpServer, io };
