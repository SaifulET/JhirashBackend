import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const SupportTicketSchema = new Schema(
  {
    createdBy: { type: Types.ObjectId, ref: "User", required: true, index: true },
    againstUserId: { type: Types.ObjectId, ref: "User" }, // optional
    tripId: { type: Types.ObjectId, ref: "Trip" },

    title: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },

    status: { type: String, enum: ["pending", "received", "resolved"], default: "pending", index: true },

    adminAction: {
      actionType: { type: String, enum: ["send_message", "mark_resolved"] },
      messageSent: { type: String },
      adminId: { type: Types.ObjectId, ref: "User" },
      at: { type: Date },
    },
  },
  { timestamps: true, versionKey: false }
);

SupportTicketSchema.index({ status: 1, createdAt: -1 });

export const SupportTicket = model("SupportTicket", SupportTicketSchema);