// tripChat/tripChat.socket.js
import { Message } from "../models/Message/message.model.js";
import {
  getTripRoom,
  getTripForParticipantOrFail,
  getOtherParticipantId,
  mapMessageDeliveryStatus,
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
        const trip = await getTripForParticipantOrFail(tripId, socket.user.id);

        if (!text || !text.trim()) {
          return socket.emit("chat:error", {
            message: "Message text is required",
            tempId: tempId || null,
          });
        }

        const receiverId = getOtherParticipantId(trip, socket.user.id);

        const message = await Message.create({
          tripId,
          senderId: socket.user.id,
          receiverId,
          text: text.trim(),
        });

        const populatedMessage = await Message.findById(message._id)
          .populate("senderId", "name profileImage role")
          .populate("receiverId", "name profileImage role")
          .lean();

        const finalMessage = mapMessageDeliveryStatus(populatedMessage);

        // sender ack: sending -> sent
        socket.emit("chat:sent", {
          tempId: tempId || null,
          message: finalMessage,
        });

        // broadcast to trip room
        io.to(getTripRoom(tripId)).emit("chat:new", finalMessage);
      } catch (error) {
        socket.emit("chat:error", {
          message: error.message || "Failed to send message",
          tempId: tempId || null,
        });
      }
    });

    socket.on("chat:seen", async ({ tripId }) => {
      try {
        await getTripForParticipantOrFail(tripId, socket.user.id);

        const now = new Date();

        await Message.updateMany(
          {
            tripId,
            receiverId: socket.user.id,
            readAt: null,
          },
          {
            $set: { readAt: now },
          }
        );

        const lastSeenMessage = await Message.findOne({
          tripId,
          receiverId: socket.user.id,
          readAt: { $ne: null },
        })
          .sort({ createdAt: -1 })
          .lean();

        io.to(getTripRoom(tripId)).emit("chat:seen:update", {
          tripId,
          seenBy: socket.user.id,
          lastSeenMessageId: lastSeenMessage?._id || null,
          seenAt: now,
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