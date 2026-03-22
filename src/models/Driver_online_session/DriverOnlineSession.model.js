import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const DriverOnlineSessionSchema = new Schema(
  {
    driverId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      index: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationMinutes: {
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

DriverOnlineSessionSchema.index({ driverId: 1, startedAt: -1 });
DriverOnlineSessionSchema.index({ driverId: 1, endedAt: 1 });

export const DriverOnlineSession = model(
  "DriverOnlineSession",
  DriverOnlineSessionSchema
);
