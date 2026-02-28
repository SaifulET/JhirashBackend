import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const DriverDocumentSchema = new Schema(
  {
    driverId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    type: {
      type: String,
      enum: ["profile_photo", "driver_license_front", "driver_license_back", "vehicle_insurance", "vehicle_registration"],
      required: true,
      index: true,
    },

    fileUrl: { type: String, required: true },

    status: { type: String, enum: ["submitted", "in_review", "approved", "rejected"], default: "submitted", index: true },
    rejectionReason: { type: String },

    reviewedBy: { type: Types.ObjectId, ref: "User" }, // admin
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

// One current doc per type per driver (efficient for admin + onboarding)
DriverDocumentSchema.index({ driverId: 1, type: 1 }, { unique: true });

export const DriverDocument = model("DriverDocument", DriverDocumentSchema);
