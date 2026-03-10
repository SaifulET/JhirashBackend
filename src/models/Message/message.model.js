import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const MessageSchema = new Schema(
  {
    tripId: { type: Types.ObjectId, ref: "Trip", required: true, index: true },
    senderId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    receiverId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, trim: true, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

MessageSchema.index({ tripId: 1, createdAt: 1 });

export const Message = model("Message", MessageSchema);