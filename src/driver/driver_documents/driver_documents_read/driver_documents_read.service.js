// src/modules/driver-onboarding-read/driverOnboardingRead.service.js

import { User } from "../../../models/User/User.model.js";
import { DriverProfile } from "../../../models/Driver_profile/Driver_profile.model.js";
import { Vehicle } from "../../../models/Vehicle/Vehicle.model.js";
import { DriverDocument } from "../../../models/Driver_documents/Driver_documents.model.js";

const validateDriver = async (userId) => {
  const user = await User.findById(userId)
    .select("role isDeleted profileImage")
    .lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (user.role !== "driver") {
    throw { status: 403, message: "Only driver can access this resource" };
  }

  return user;
};

const mapDocument = (doc) => {
  if (!doc) {
    return null;
  }

  return {
    _id: doc._id,
    type: doc.type,
    fileUrl: doc.fileUrl,
    status: doc.status,
    rejectionReason: doc.rejectionReason || null,
    reviewedAt: doc.reviewedAt || null,
  };
};

export const driverOnboardingReadService = {
async getSummary(userId) {
  await validateDriver(userId);

  const [driverProfile, vehicle, documents] = await Promise.all([
    DriverProfile.findOne({ userId })
      .select("stripeAccountId stripeConnected")
      .lean(),

    Vehicle.findOne({ driverId: userId, isActive: true })
      .select("_id brand model year type size seats licensePlate approved isActive")
      .lean(),

    DriverDocument.find({ driverId: userId })
      .select("type")
      .lean(),
  ]);

  if (!driverProfile) {
    throw { status: 404, message: "Driver profile not found" };
  }

  // Convert documents -> Set for O(1) checks
  const docTypes = new Set(documents.map(d => d.type));

  let missingCount = 0;

  if (!driverProfile.stripeAccountId) missingCount++;
  if (!docTypes.has("driver_license_front")) missingCount++;
  if (!docTypes.has("driver_license_back")) missingCount++;
  if (!docTypes.has("vehicle_registration")) missingCount++;
  if (!docTypes.has("vehicle_insurance")) missingCount++;
  if (!vehicle) missingCount++;

  return { missingCount };
},

  async getProfileImage(userId) {
    const user = await validateDriver(userId);

    return {
      profileImage: user.profileImage || null,
    };
  },

  async getLicensePhotos(userId) {
    await validateDriver(userId);

    const [front, back] = await Promise.all([
      DriverDocument.findOne(
        { driverId: userId, type: "driver_license_front" },
        { fileUrl: 1, status: 1, rejectionReason: 1 }
      ).lean(),

      DriverDocument.findOne(
        { driverId: userId, type: "driver_license_back" },
        { fileUrl: 1, status: 1, rejectionReason: 1 }
      ).lean(),
    ]);

    return {
      front: front || null,
      back: back || null,
    };
  },

  async getVehicleRegistration(userId) {
    await validateDriver(userId);

    const registration = await DriverDocument.findOne(
      { driverId: userId, type: "vehicle_registration" },
      { fileUrl: 1, status: 1, rejectionReason: 1 }
    ).lean();

    return {
      vehicleRegistration: registration || null,
    };
  },

  async getInsurance(userId) {
    await validateDriver(userId);

    const insurance = await DriverDocument.findOne(
      { driverId: userId, type: "vehicle_insurance" },
      { fileUrl: 1, status: 1, rejectionReason: 1 }
    ).lean();

    return {
      vehicleInsurance: insurance || null,
    };
  },

  async getStripeId(userId) {
    await validateDriver(userId);

    const driverProfile = await DriverProfile.findOne(
      { userId },
      { stripeAccountId: 1, stripeConnected: 1 }
    ).lean();

    if (!driverProfile) {
      throw { status: 404, message: "Driver profile not found" };
    }

    return {
      stripeAccountId: driverProfile.stripeAccountId || null,
      stripeConnected: driverProfile.stripeConnected || false,
    };
  },

  async getVehicleInfo(userId) {
    await validateDriver(userId);

    const vehicle = await Vehicle.findOne(
      { driverId: userId, isActive: true },
      {
        brand: 1,
        model: 1,
        year: 1,
        type: 1,
        priceRange: 1,
        size: 1,
        seats: 1,
        licensePlate: 1,
        approved: 1,
        isActive: 1,
      }
    ).lean();

    return {
      vehicle: vehicle || null,
    };
  },
};
