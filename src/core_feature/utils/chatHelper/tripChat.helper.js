// tripChat/tripChat.helper.js
import { Trip } from "../../../models/Trip/Trip.model.js";
import { User } from "../../../models/User/User.model.js";

export const CHAT_ALLOWED_STATUSES = [
  "accepted",
  "driver_arrived",
  "otp_verified",
  "started",
  "completed",
  "cancelled",
];

export const getTripRoom = (tripId) => `trip:${tripId}`;

export const getUserOrFail = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  return user;
};

export const getTripForParticipantOrFail = async (tripId, userId) => {
  const trip = await Trip.findOne({
    _id: tripId,
    $or: [{ riderId: userId }, { driverId: userId }],
    status: { $in: CHAT_ALLOWED_STATUSES },
  }).lean();

  if (!trip) {
    throw { status: 404, message: "Trip not found" };
  }

  return trip;
};

export const getOtherParticipantId = (trip, userId) => {
  return String(trip.riderId) === String(userId) ? trip.driverId : trip.riderId;
};

export const getOtherParticipantRole = (trip, userId) => {
  return String(trip.riderId) === String(userId) ? "driver" : "rider";
};

export const mapMessageDeliveryStatus = (message) => {
  return {
    ...message,
    deliveryStatus: message.readAt ? "seen" : "sent",
  };
};