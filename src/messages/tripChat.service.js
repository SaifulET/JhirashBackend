// tripChat/tripChat.service.js
import { Message } from "../models/Message/message.model.js";
import { User } from "../models/User/User.model.js";
import { Vehicle } from "../models/Vehicle/Vehicle.model.js";
import {
  getTripForParticipantOrFail,
  getOtherParticipantId,
  getOtherParticipantRole,
  mapMessageDeliveryStatus,
} from "../core_feature/utils/chatHelper/tripChat.helper.js";

export const tripChatService = {
  async getHeader(userId, tripId) {
    const trip = await getTripForParticipantOrFail(tripId, userId);

    const otherUserId = getOtherParticipantId(trip, userId);
    const otherRole = getOtherParticipantRole(trip, userId);

    const [otherUser, vehicle] = await Promise.all([
      User.findById(otherUserId).lean(),
      trip.vehicleId ? Vehicle.findById(trip.vehicleId).lean() : null,
    ]);

    if (!otherUser) {
      throw { status: 404, message: "Chat user not found" };
    }

    return {
      tripId: trip._id,
      otherUser: {
        _id: otherUser._id,
        name: otherUser.name,
        profileImage: otherUser.profileImage || null,
        role: otherRole,
      },
      vehicle: vehicle
        ? {
            brand: vehicle.brand,
            model: vehicle.model,
            licensePlate: vehicle.licensePlate,
            type: vehicle.type,
            size: vehicle.size,
          }
        : null,
    };
  },

  async getMessages(userId, tripId) {
    await getTripForParticipantOrFail(tripId, userId);

    const messages = await Message.find({ tripId })
      .sort({ createdAt: 1 })
      .populate("senderId", "name profileImage role")
      .populate("receiverId", "name profileImage role")
      .lean();

    return {
      items: messages.map(mapMessageDeliveryStatus),
    };
  },

  async sendMessage(userId, tripId, payload) {
    const trip = await getTripForParticipantOrFail(tripId, userId);

    const text = payload?.text?.trim();
    if (!text) {
      throw { status: 400, message: "Message text is required" };
    }

    const receiverId = getOtherParticipantId(trip, userId);

    const message = await Message.create({
      tripId,
      senderId: userId,
      receiverId,
      text,
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "name profileImage role")
      .populate("receiverId", "name profileImage role")
      .lean();

    return mapMessageDeliveryStatus(populatedMessage);
  },

  async markSeen(userId, tripId) {
    const trip = await getTripForParticipantOrFail(tripId, userId);
    const otherUserId = getOtherParticipantId(trip, userId);

    const now = new Date();

    await Message.updateMany(
      {
        tripId,
        receiverId: userId,
        readAt: null,
      },
      {
        $set: { readAt: now },
      }
    );

    const lastSeenMessage = await Message.findOne({
      tripId,
      receiverId: userId,
      readAt: { $ne: null },
    })
      .sort({ createdAt: -1 })
      .lean();

    return {
      tripId,
      seenAt: now,
      lastSeenMessageId: lastSeenMessage?._id || null,
      seenBy: userId,
      participantUserIds: [userId, otherUserId],
    };
  },

  async getUnreadCount(userId, tripId) {
    await getTripForParticipantOrFail(tripId, userId);

    const count = await Message.countDocuments({
      tripId,
      receiverId: userId,
      readAt: null,
    });

    return { count };
  },
};
