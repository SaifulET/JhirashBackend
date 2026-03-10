import { FareConfig } from "../../models/App_Config/App_Config.model.js";

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
};

const formatBaseFare = (baseFare = {}) => ({
  car_regular: toNumber(baseFare.car_regular),
  car_premium: toNumber(baseFare.car_premium),

  suv_compact_regular: toNumber(baseFare.suv_compact_regular),
  suv_compact_premium: toNumber(baseFare.suv_compact_premium),
  suv_full_regular: toNumber(baseFare.suv_full_regular),
  suv_full_premium: toNumber(baseFare.suv_full_premium),

  van_compact_regular: toNumber(baseFare.van_compact_regular),
  van_compact_premium: toNumber(baseFare.van_compact_premium),
  van_full_regular: toNumber(baseFare.van_full_regular),
  van_full_premium: toNumber(baseFare.van_full_premium),
});

export const fareConfigService = {

  async getConfig() {
    const config = await FareConfig.findOne({ active: true }).lean();
    return config;
  },

  async createConfig(adminId, payload) {

    const existing = await FareConfig.findOne({ active: true });

    if (existing) {
      throw { status: 400, message: "Fare configuration already exists" };
    }

    const config = await FareConfig.create({
      name: "default",
      active: true,
      currency: payload.currency || "USD",
      baseFare: formatBaseFare(payload.baseFare),
      pricePerMile: toNumber(payload.pricePerMile),
      pricePerMinute: toNumber(payload.pricePerMinute),
      driverSharePercent: toNumber(payload.driverSharePercent, 60),
      effectiveFrom: new Date(),
      createdBy: adminId,
    });

    return config;
  },

 async  updateConfig(adminId, payload) {

  const update = {
    updatedBy: adminId,
  };

  if (payload.currency !== undefined) {
    update.currency = payload.currency;
  }

  if (payload.pricePerMile !== undefined) {
    update.pricePerMile = toNumber(payload.pricePerMile);
  }

  if (payload.pricePerMinute !== undefined) {
    update.pricePerMinute = toNumber(payload.pricePerMinute);
  }

  if (payload.driverSharePercent !== undefined) {
    update.driverSharePercent = toNumber(payload.driverSharePercent, 60);
  }

  // update only sent baseFare fields
  if (payload.baseFare) {
    Object.entries(payload.baseFare).forEach(([key, value]) => {
      update[`baseFare.${key}`] = toNumber(value);
    });
  }

  const config = await FareConfig.findOneAndUpdate(
    { active: true },
    { $set: update },
    { new: true }
  );

  if (!config) {
    throw { status: 404, message: "Fare configuration not found" };
  }

  return config;
}

};