import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
/* -------------------------------- Payment -------------------------------- */

const PaymentSchema = new Schema(
  {
    tripId: { type: Types.ObjectId, ref: "Trip", required: true, unique: true },
    riderId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    driverId: { type: Types.ObjectId, ref: "User", index: true },

    provider: { type: String, enum: ["stripe"], default: "stripe" },
    stripePaymentIntentId: { type: String },
    status: { type: String, enum: ["pending", "succeeded", "failed", "refunded"], default: "pending", index: true },

    currency: { type: String, default: "USD" },
    totalFare: { type: Number, required: true },
    driverGets: { type: Number, required: true },
    platformGets: { type: Number, required: true },

    breakdown: {
      cancellationFee: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
    },
  },
  { timestamps: true, versionKey: false }
);

PaymentSchema.index({ driverId: 1, createdAt: -1 });
PaymentSchema.index({ riderId: 1, createdAt: -1 });

export const Payment = model("Payment", PaymentSchema);