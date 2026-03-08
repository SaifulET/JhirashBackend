import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const PointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 2,
        message: "coordinates must be [lng, lat]",
      },
    },
  },
  { _id: false }
);

const DriverProfileSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    isBusy: {
      type: Boolean,
      default: false,
    },

    location: {
      point: {
        type: PointSchema,
        default: {
          type: "Point",
          coordinates: [0, 0],
        },
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },

    documentsStatus: {
      type: String,
      enum: ["pending", "in_review", "verified", "denied"],
      default: "pending",
    },

    requiredActionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    stripeAccountId: {
      type: String,
      default: null,
      trim: true,
    },

    stripeConnected: {
      type: Boolean,
      default: false,
    },

    activeVehicleId: {
      type: Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },

    earningsTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    tripsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// required for one profile per user and fast lookup by userId
DriverProfileSchema.index({ userId: 1 }, { unique: true });

// keep only if you really use nearby-driver queries
DriverProfileSchema.index({ "location.point": "2dsphere" });

// keep only if you really use this query often:
// find({ status, isOnline, isBusy })
DriverProfileSchema.index({ status: 1, isOnline: 1, isBusy: 1 });

// keep only if you really use admin filtering by docs + status
DriverProfileSchema.index({ documentsStatus: 1, status: 1 });

export const DriverProfile = model("DriverProfile", DriverProfileSchema);