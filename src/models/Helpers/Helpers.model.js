import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const PointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 2,
        message: "coordinates must be [lng,lat]",
      },
    },
  },
  { _id: false }
);

const PlaceSchema = new Schema(
  {
    address: { type: String, trim: true },
    label: { type: String, trim: true },
    location: { type: PointSchema, required: true },
  },
  { _id: false }
);

const softDeleteFields = {
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
};