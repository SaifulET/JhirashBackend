// tripChat/tripChat.socket.js
import { tripChatService } from "./tripChat.service.js";
import {
  emitChatMessageRealtime,
  emitChatSeenRealtime,
} from "./tripChatRealtime.helper.js";
import {
  getTripRoom,
  getTripForParticipantOrFail,
} from "../core_feature/utils/chatHelper/tripChat.helper.js";

export const registerTripChatSocket = (io) => {
  io.on("connection", (socket) => {
    socket.on("chat:join", async ({ tripId }) => {
      try {
        await getTripForParticipantOrFail(tripId, socket.user.id);

        const room = getTripRoom(tripId);
        socket.join(room);

        socket.emit("chat:joined", {
          tripId,
          room,
        });
      } catch (error) {
        socket.emit("chat:error", {
          message: error.message || "Failed to join chat",
        });
      }
    });

    socket.on("chat:leave", ({ tripId }) => {
      const room = getTripRoom(tripId);
      socket.leave(room);
    });

    socket.on("chat:send", async ({ tripId, text, tempId }) => {
      try {
        const finalMessage = await tripChatService.sendMessage(socket.user.id, tripId, { text });

        // sender ack: sending -> sent
        socket.emit("chat:sent", {
          tempId: tempId || null,
          message: finalMessage,
        });

        emitChatMessageRealtime({
          message: finalMessage,
          socket,
        });
      } catch (error) {
        socket.emit("chat:error", {
          message: error.message || "Failed to send message",
          tempId: tempId || null,
        });
      }
    });

    socket.on("chat:seen", async ({ tripId }) => {
      try {
        const result = await tripChatService.markSeen(socket.user.id, tripId);
        const { participantUserIds = [], ...seenPayload } = result;

        emitChatSeenRealtime({
          seenPayload,
          participantUserIds,
          socket,
        });
      } catch (error) {
        socket.emit("chat:error", {
          message: error.message || "Failed to mark messages as seen",
        });
      }
    });

    socket.on("disconnect", () => {
      // optional cleanup
    });
  });
};
