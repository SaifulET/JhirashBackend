import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const ReportSchema = new Schema(
  {
    reporterId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    reportedUserId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    tripId: { type: Types.ObjectId, ref: "Trip" },

    message: { type: String, trim: true, required: true },
    status: { type: String, enum: ["pending", "reviewed", "resolved"], default: "pending", index: true },

    resolutionNote: { type: String },
    resolvedBy: { type: Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

ReportSchema.index({ reportedUserId: 1, createdAt: -1 });

export const Report = model("Report", ReportSchema);