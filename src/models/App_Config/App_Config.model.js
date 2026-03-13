import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const FareConfigSchema = new Schema(
  {
    name: { type: String, default: "default" },
    active: { type: Boolean, default: true, index: true },
    currency: { type: String, default: "USD" },

    baseFare: {
      // keys match your vehicle options; adjust as needed
      car_regular: { type: Number, default: 0 },
      car_premium: { type: Number, default: 0 },
      suv_compact_regular: { type: Number, default: 0 },
      suv_compact_premium: { type: Number, default: 0 },
      suv_full_regular: { type: Number, default: 0 },
      suv_full_premium: { type: Number, default: 0 },
      van_compact_regular: { type: Number, default: 0 },
      van_compact_premium: { type: Number, default: 0 },
      van_full_regular: { type: Number, default: 0 },
      van_full_premium: { type: Number, default: 0 },
    },

    pricePerMile: { type: Number, default: 0 },
    pricePerMinute: { type: Number, default: 0 },

    driverSharePercent: { type: Number, min: 0, max: 100, default: 40 },

    effectiveFrom: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, versionKey: false }
);

FareConfigSchema.index({ active: 1, effectiveFrom: -1 });

export const FareConfig = model("FareConfigs", FareConfigSchema);
