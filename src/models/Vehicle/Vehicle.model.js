import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const VehicleSchema = new Schema(
  {
    driverId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },

    brand: {
      type: String,
      trim: true,
      required: true,
    },
    model: {
      type: String,
      trim: true,
      required: true,
    },
    year: {
      type: Number,
    },
    type: {
      type: String,
      enum: ["car", "suv", "van"],
      required: true,
    },
    tier: {
  type: String,
  enum: ["regular", "premium"],
  default: "regular",
},
    size: {
      type: String,
      trim: true,
    },
    seats: {
      type: Number,
      default: 4,
    },
    priceRange: {
      type: Number,
    },
    licensePlate: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    approved: {
      type: Boolean,
      default: false,
    },
    reviewStatus: {
      type: String,
      enum: [
        "submitted",
        "in_review",
        "approved",
        "rejected",
        "complete",
        "need_attention",
      ],
      default: "submitted",
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

// Best index for:
// findOne({ driverId, isActive: true })
VehicleSchema.index({ driverId: 1, isActive: 1 });

// Optional: if licensePlate should be unique
// VehicleSchema.index({ licensePlate: 1 }, { unique: true, sparse: true });

// Optional: enforce one active vehicle per driver
VehicleSchema.index(
  { driverId: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  }
);

export const Vehicle = model("Vehicle", VehicleSchema);
