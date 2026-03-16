// socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { registerTripChatSocket } from "./tripChat.socket.js";
import { registerRideRequestSocket } from "./rideRequest.socket.js";

let ioInstance = null;

export const getUserRoom = (userId) => `user:${userId}`;
export const getIO = () => ioInstance;

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || "access_secret"
      );

      socket.user = {
        id: payload.id || payload.sub,
        role: payload.role,
      };

      next();
    } catch (error) {
      next(new Error("Unauthorized"));
    }
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    const userRoom = getUserRoom(socket.user.id);
    socket.join(userRoom);

    socket.emit("socket:ready", {
      userId: socket.user.id,
      role: socket.user.role || null,
      room: userRoom,
    });
  });

  registerTripChatSocket(io);
  registerRideRequestSocket(io);

  return io;
};
