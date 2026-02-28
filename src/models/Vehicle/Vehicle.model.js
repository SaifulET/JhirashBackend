import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const VehicleSchema = new Schema(
  {
    driverId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    brand: { type: String, trim: true, required: true },
    model: { type: String, trim: true, required: true },
    year: { type: Number, min: 1980, max: 2100 },

    type: { type: String, enum: ["car", "suv", "van"], required: true, index: true },
    tier: { type: String, enum: ["regular", "premium"], default: "regular", index: true },
    size: { type: String, enum: ["compact", "normal", "full"], default: "normal" },
    seats: { type: Number, min: 1, max: 20, default: 4 },

    licensePlate: { type: String, trim: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    approved: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false }
);

VehicleSchema.index({ driverId: 1, isActive: 1, createdAt: -1 });

export const Vehicle = model("Vehicle", VehicleSchema);
