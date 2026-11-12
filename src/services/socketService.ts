import { Server } from "socket.io";

let ioInstance: Server | null = null;

export const setSocketInstance = (io: Server): void => {
  ioInstance = io;
};

export const getSocketInstance = (): Server | null => {
  return ioInstance;
};

export const emitToRestaurant = (
  restaurantId: string,
  event: string,
  payload: any
): void => {
  if (ioInstance) {
    ioInstance.to(`restaurant:${restaurantId}`).emit(event, {
      restaurantId,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }
};

