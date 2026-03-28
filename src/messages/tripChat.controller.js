// tripChat/tripChat.controller.js
import { tripChatService } from "./tripChat.service.js";
import {
  emitChatMessageRealtime,
  emitChatSeenRealtime,
} from "./tripChatRealtime.helper.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
    error: error.error || null,
  });
};

export const tripChatController = {
  async getHeader(req, res) {
    try {
      const result = await tripChatService.getHeader(req.auth.userId, req.params.tripId);

      return res.status(200).json({
        success: true,
        message: "Chat header fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getMessages(req, res) {
    try {
      const result = await tripChatService.getMessages(req.auth.userId, req.params.tripId);

      return res.status(200).json({
        success: true,
        message: "Messages fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async sendMessage(req, res) {
    try {
      const result = await tripChatService.sendMessage(req.auth.userId, req.params.tripId, req.body);
      emitChatMessageRealtime({ message: result });

      return res.status(201).json({
        success: true,
        message: "Message sent successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async markSeen(req, res) {
    try {
      const result = await tripChatService.markSeen(req.auth.userId, req.params.tripId);
      const { participantUserIds = [], ...responseData } = result;

      emitChatSeenRealtime({
        seenPayload: responseData,
        participantUserIds,
      });

      return res.status(200).json({
        success: true,
        message: "Messages marked as seen",
        data: responseData,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getUnreadCount(req, res) {
    try {
      const result = await tripChatService.getUnreadCount(req.auth.userId, req.params.tripId);

      return res.status(200).json({
        success: true,
        message: "Unread count fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
};
