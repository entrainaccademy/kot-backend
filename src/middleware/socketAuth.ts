import { Socket } from "socket.io";
import { verifyAccessToken, AuthUserPayload } from "../utils/jwt";

export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void
): void => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication error: Token required."));
    }

    const payload: AuthUserPayload = verifyAccessToken(token);
    socket.data.user = payload;

    // Automatically join restaurant tenant room for scoped live events
    if (payload.restaurantId) {
      socket.join(`restaurant:${payload.restaurantId}`);
    }

    next();
  } catch (error) {
    next(new Error("Authentication error: Invalid or expired token."));
  }
};

