import mongoose from "mongoose";
import { User } from "../../../models/User/User.model.js";
import { SupportTicket } from "../../../models/Support_tickets/Support_tickets.model.js";

const ALLOWED_SUPPORT_TICKET_ROLES = new Set(["rider", "driver"]);

const getValidObjectIdOrNull = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw { status: 400, message: `${fieldName} must be a valid id` };
  }

  return value;
};

export const getSupportTicketCreatorOrFail = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (!ALLOWED_SUPPORT_TICKET_ROLES.has(user.role)) {
    throw { status: 403, message: "Only rider or driver can create support tickets" };
  }

  return user;
};

export const createSupportTicketForUser = async (userId, payload = {}) => {
  const user = await getSupportTicketCreatorOrFail(userId);
  const title = String(payload.title || "").trim();
  const message = String(payload.message || "").trim();

  if (!title) {
    throw { status: 400, message: "title is required" };
  }

  if (!message) {
    throw { status: 400, message: "message is required" };
  }

  const ticket = await SupportTicket.create({
    createdBy: user._id,
    againstUserId: getValidObjectIdOrNull(payload.againstUserId, "againstUserId"),
    tripId: getValidObjectIdOrNull(payload.tripId, "tripId"),
    title,
    message,
    status: "pending",
  });

  return {
    message: "Support ticket created successfully",
    ticket,
  };
};
