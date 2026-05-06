import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import {PointSchema} from "../../models/Helpers/Helpers.model.js"
const RideRequestSchema = new Schema(
  {
    riderId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    pickup: { address: { type: String }, point: { type: PointSchema, required: true } },
    dropoff: { address: { type: String }, point: { type: PointSchema, required: true } },

    schedule: {
      kind: { type: String, enum: ["now", "later"], default: "now" },
      pickupAt: { type: Date },
    },

    preference: {
      vehicleType: {
        type: String,
        enum: ["any", "car", "suv", "van"],
        default: "any",
      },
      tier: {
        type: String,
        enum: ["any", "regular", "premium"],
        default: "any",
      },
      seats: {
        type: Number,
        default: null,
        min: 1,
      },
      size: {
        type: String,
        enum: ["compact", "normal", "full"],
      },
    },

    status: { type: String, enum: ["searching", "matched", "expired", "cancelled"], default: "searching", index: true },

    matchedDriverId: { type: Types.ObjectId, ref: "User", index: true },

    // quote snapshot (fast + config-safe)
    quote: {
      currency: { type: String, default: "USD" },
      estimatedMiles: { type: Number, default: 0 },
      estimatedMinutes: { type: Number, default: 0 },
      baseFare: { type: Number, default: 0 },
      estimatedFare: { type: Number, default: 0 },
      driverSharePercent: { type: Number },
    },

    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

RideRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
RideRequestSchema.index({ "pickup.point": "2dsphere" });

export const RideRequest = model("RideRequest", RideRequestSchema);
