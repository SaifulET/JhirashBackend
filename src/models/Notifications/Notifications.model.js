import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const NotificationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String },
    body: { type: String },
    data: { type: Schema.Types.Mixed },
    readAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = model("Notification", NotificationSchema);