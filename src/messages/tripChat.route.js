// tripChat/tripChat.route.js
import express from "express";
import { tripChatController } from "./tripChat.controller.js";
import { requireAuth } from "../core_feature/middleware/requireAuth.js";

const ChatRouter = express.Router();

ChatRouter.use(requireAuth);

ChatRouter.get("/trips/:tripId/chat/header", tripChatController.getHeader);
ChatRouter.get("/trips/:tripId/chat/messages", tripChatController.getMessages);
ChatRouter.post("/trips/:tripId/chat/messages", tripChatController.sendMessage);
ChatRouter.patch("/trips/:tripId/chat/seen", tripChatController.markSeen);
ChatRouter.get("/trips/:tripId/chat/unread-count", tripChatController.getUnreadCount);

export default ChatRouter;