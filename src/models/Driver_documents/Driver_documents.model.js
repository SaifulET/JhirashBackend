import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const DriverDocumentSchema = new Schema(
  {
    driverId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "profile_photo",
        "driver_license_front",
        "driver_license_back",
        "vehicle_insurance",
        "vehicle_registration",
      ],
      required: true,
    },

    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "submitted",
        "in_review",
        "approved",
        "rejected",
        "complete",
        "need_attention",
      ],
      default: "in_review",
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    reviewedBy: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// best index for onboarding and upsert
DriverDocumentSchema.index(
  { driverId: 1, type: 1 },
  { unique: true }
);

// keep this only if admins frequently filter by status
DriverDocumentSchema.index({ status: 1 });

// optional admin review queue optimization
// DriverDocumentSchema.index({ status: 1, createdAt: -1 });

export const DriverDocument = model("DriverDocument", DriverDocumentSchema);
