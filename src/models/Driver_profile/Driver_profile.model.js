import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const DriverProfileSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    status: { type: String, enum: ["pending", "active", "suspended"], default: "pending", index: true },

    isOnline: { type: Boolean, default: false, index: true },
    isBusy: { type: Boolean, default: false, index: true },

    // geo-based matching
    location: {
      point: { type: PointSchema },
      updatedAt: { type: Date },
    },

    // verification summary for fast admin view
    documentsStatus: { type: String, enum: ["pending", "in_review", "verified", "denied"], default: "pending", index: true },
    requiredActionsCount: { type: Number, default: 0 },

    // stripe connect
    stripeAccountId: { type: String },
    stripeConnected: { type: Boolean, default: false },

    activeVehicleId: { type: Types.ObjectId, ref: "Vehicle" },

    // optional denorm
    earningsTotal: { type: Number, default: 0 },
    tripsCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

DriverProfileSchema.index({ "location.point": "2dsphere" });
DriverProfileSchema.index({ isOnline: 1, isBusy: 1, status: 1 });

export const DriverProfile = model("DriverProfile", DriverProfileSchema);