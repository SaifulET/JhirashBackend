import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import {PointSchema} from "../../models/Helpers/Helpers.model.js"
const TripStatusItemSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["accepted", "driver_arrived", "otp_verified", "started", "completed", "cancelled"],
      required: true,
    },
    at: { type: Date, default: Date.now },
    by: { type: String, enum: ["rider", "driver", "system", "admin"], default: "system" },
  },
  { _id: false }
);

const TripSchema = new Schema(
  {
    requestId: { type: Types.ObjectId, ref: "RideRequest", index: true },

    riderId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    driverId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    vehicleId: { type: Types.ObjectId, ref: "Vehicle" },

    pickup: { address: String, point: { type: PointSchema, required: true } },
    dropoff: { address: String, point: { type: PointSchema, required: true } },

    status: {
      type: String,
      enum: ["accepted", "driver_arrived", "otp_verified", "started", "completed", "cancelled"],
      default: "accepted",
      index: true,
    },

    statusHistory: { type: [TripStatusItemSchema], default: [] },

    otp: {
      hash: { type: String },
      expiresAt: { type: Date },
      verifiedAt: { type: Date },
    },

    distanceMiles: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },

    // pricing snapshot (important: config changes should not affect old trips)
    pricing: {
      currency: { type: String, default: "USD" },
      baseFare: { type: Number, default: 0 },
      pricePerMile: { type: Number, default: 0 },
      pricePerMinute: { type: Number, default: 0 },
      surgeMultiplier: { type: Number, default: 1 },
      driverSharePercent: { type: Number },
      estimatedFare: { type: Number, default: 0 },
      finalFare: { type: Number, default: 0 },
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "authorized", "paid", "failed", "refunded", "partial"],
      default: "unpaid",
      index: true,
    },rideOption: {
  vehicleType: {
    type: String,
    enum: ["car", "suv", "van"],
  },
  tier: {
    type: String,
    enum: ["regular", "premium"],
  },
  size: {
    type: String,
    enum: ["compact", "normal", "full"],
  },
},

    cancellation: {
      canceledBy: { type: String, enum: ["rider", "driver", "system", "admin"] },
      reason: { type: String },
      canceledAt: { type: Date },
      feeCharged: { type: Number, default: 0 },
      rule: { type: String }, // e.g. AFTER_START_60_PERCENT
    },
  },
  { timestamps: true, versionKey: false }
);

TripSchema.index({ riderId: 1, createdAt: -1 });
TripSchema.index({ driverId: 1, createdAt: -1 });
TripSchema.index({ status: 1, createdAt: -1 });

export const Trip = model("Trip", TripSchema);
