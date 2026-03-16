import { getIO, getUserRoom } from "./socket.js";

const normalizeUserIds = (userIds = []) =>
  [...new Set(userIds.filter(Boolean).map((userId) => String(userId)))];

export const emitToUser = (userId, eventName, payload) => {
  const io = getIO();
  if (!io || !userId) {
    return;
  }

  io.to(getUserRoom(userId)).emit(eventName, payload);
};

export const emitToUsers = (userIds, eventName, payload) => {
  const io = getIO();
  if (!io) {
    return;
  }

  normalizeUserIds(userIds).forEach((userId) => {
    io.to(getUserRoom(userId)).emit(eventName, payload);
  });
};
