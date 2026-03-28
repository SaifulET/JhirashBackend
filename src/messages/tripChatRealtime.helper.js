import { emitToUser } from "./socketRealtime.helper.js";
import { getUserRoom } from "./socket.js";

const normalizeUserId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object" && value._id) {
    return String(value._id);
  }

  return String(value);
};

const getUniqueUserIds = (userIds = []) =>
  [...new Set(userIds.map(normalizeUserId).filter(Boolean))];

export const emitChatMessageRealtime = ({ message, socket = null }) => {
  const senderId = normalizeUserId(message?.senderId);
  const receiverId = normalizeUserId(message?.receiverId);

  if (socket && senderId) {
    socket.to(getUserRoom(senderId)).emit("chat:new", message);
  } else if (senderId) {
    emitToUser(senderId, "chat:new", message);
  }

  if (receiverId) {
    emitToUser(receiverId, "chat:new", message);
  }
};

export const emitChatSeenRealtime = ({
  seenPayload,
  participantUserIds = [],
  socket = null,
}) => {
  const uniqueUserIds = getUniqueUserIds(participantUserIds);
  const activeSocketUserId = normalizeUserId(socket?.user?.id);

  uniqueUserIds.forEach((userId) => {
    if (socket && userId === activeSocketUserId) {
      socket.to(getUserRoom(userId)).emit("chat:seen:update", seenPayload);
      return;
    }

    emitToUser(userId, "chat:seen:update", seenPayload);
  });
};
