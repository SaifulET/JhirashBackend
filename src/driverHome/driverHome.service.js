// src/modules/driver-home/driverHome.service.js

import mongoose from "mongoose";
import { User } from "../models/User/User.model.js";
import { DriverProfile } from "../models/Driver_profile/Driver_profile.model.js";
import { Vehicle } from "../models/Vehicle/Vehicle.model.js";
import { RideRequest } from "../models/Ride_request/Ride_request.model.js";
import { Trip } from "../models/Trip/Trip.model.js";
import { Payment } from "../models/Payment/Payment.model.js";
import { Rating } from "../models/Rating/Rating.model.js";
import { sendEmail } from "../core_feature/utils/mailerSender/mailer.js";
import bcrypt from "bcryptjs";
const ACTIVE_TRIP_STATUSES = ["accepted", "driver_arrived", "otp_verified", "started"];

const getDriverUser = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "Driver not found" };
  }

  if (user.role !== "driver") {
    throw { status: 403, message: "Only driver can access this resource" };
  }

  return user;
};

const getDriverProfileOrFail = async (userId) => {
  const profile = await DriverProfile.findOne({ userId });
  if (!profile) {
    throw { status: 404, message: "Driver profile not found" };
  }
  return profile;
};

const getActiveTripForDriver = async (userId) => {
  return Trip.findOne({
    driverId: userId,
    status: { $in: ACTIVE_TRIP_STATUSES },
  }).sort({ createdAt: -1 });
};

const buildRideRequestQuery = (driverProfile) => {
  const coordinates = driverProfile?.location?.point?.coordinates || [0, 0];

  return {
    status: "searching",
    expiresAt: { $gt: new Date() },
    pickup: {
      point: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates,
          },
          $maxDistance: 10000, // 10km radius
        },
      },
    },
  };
};

const compareOtp = (plainOtp, trip) => {
  if (!trip?.otp?.hash) return false;
  return String(trip.otp.hash) === String(plainOtp);
};

const computeDriverGets = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  const percent = Number(trip?.pricing?.driverSharePercent || 60);
  return Number(((totalFare * percent) / 100).toFixed(2));
};
const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));
const computePlatformGets = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  const driverGets = computeDriverGets(trip);
  return Number((totalFare - driverGets).toFixed(2));
};

const buildPaymentAmounts = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  const driverGets = computeDriverGets(trip);
  const platformGets = computePlatformGets(trip);

  return { totalFare, driverGets, platformGets };
};

const syncPaymentRecord = async (trip, overrides = {}) => {
  const { totalFare, driverGets, platformGets } = buildPaymentAmounts(trip);

  const payment = await Payment.findOneAndUpdate(
    { tripId: trip._id },
    {
      $set: {
        riderId: trip.riderId,
        driverId: trip.driverId,
        provider: "stripe",
        currency: trip.pricing.currency || "USD",
        totalFare,
        driverGets,
        platformGets,
        breakdown: {
          cancellationFee: Number(trip?.cancellation?.feeCharged || 0),
          platformFee: platformGets,
        },
        ...overrides,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return { payment, totalFare, driverGets, platformGets };
};

const creditDriverEarnings = async (driverId, amount) => {
  if (Number(amount || 0) <= 0) {
    return null;
  }

  const driverProfile = await DriverProfile.findOne({ userId: driverId });
  if (!driverProfile) {
    return null;
  }

  driverProfile.earningsTotal = Number(
    (Number(driverProfile.earningsTotal || 0) + Number(amount || 0)).toFixed(2)
  );

  await driverProfile.save();
  return driverProfile;
};

export const driverHomeService = {
  async getHome(userId) {
    const user = await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    const [activeTrip, activeRideRequest] = await Promise.all([
      getActiveTripForDriver(userId),
      profile.isOnline && !profile.isBusy
        ? RideRequest.findOne(buildRideRequestQuery(profile))
            .sort({ createdAt: 1 })
            
        : null,
    ]);

    return {
      profile: {
        _id: user._id,
        name: user.name,
        profileImage: user.profileImage || null,
      },
      driverProfile: {
        status: profile.status,
        isOnline: profile.isOnline,
        isBusy: profile.isBusy,
        documentsStatus: profile.documentsStatus,
        requiredActionsCount: profile.requiredActionsCount,
        earningsTotal: profile.earningsTotal,
        tripsCount: profile.tripsCount,
        activeVehicleId: profile.activeVehicleId,
      },
      activeRideRequest,
      activeTrip,
    };
  },

  async goOnline(userId, payload) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);
    console.log(profile,"profile")

    if (profile.status !== "pending") {
      throw { status: 400, message: "Driver is not eligible to go online" };
    }

    if (!profile.activeVehicleId) {
      throw { status: 400, message: "Active vehicle is required" };
    }

    if (payload?.lat !== undefined && payload?.lng !== undefined) {
      profile.location = {
        point: {
          type: "Point",
          coordinates: [payload.lng, payload.lat],
        },
        updatedAt: new Date(),
      };
    }

    profile.isOnline = true;
    profile.isBusy = false;
    await profile.save();

    return {
      message: "Driver is now online",
      isOnline: profile.isOnline,
      isBusy: profile.isBusy,
      location: profile.location,
    };
  },

  async goOffline(userId) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    const activeTrip = await getActiveTripForDriver(userId);
    if (activeTrip) {
      throw { status: 400, message: "Cannot go offline during an active trip" };
    }

    profile.isOnline = false;
    profile.isBusy = false;
    await profile.save();

    return {
      message: "Driver is now offline",
      isOnline: profile.isOnline,
      isBusy: profile.isBusy,
    };
  },

  async updateLocation(userId, payload) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    if (payload?.lat === undefined || payload?.lng === undefined) {
      throw { status: 400, message: "lat and lng are required" };
    }

    profile.location = {
      point: {
        type: "Point",
        coordinates: [payload.lng, payload.lat],
      },
      updatedAt: new Date(),
    };

    await profile.save();

    return {
      message: "Driver location updated",
      location: profile.location,
    };
  },

  async getNextRideRequest(userId) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    if (!profile.isOnline || profile.isBusy) {
      return {
        request: null,
      };
    }

    const request = await RideRequest.findOne(buildRideRequestQuery(profile))
      .sort({ createdAt: 1 })
      .populate("riderId", "name profileImage ratingAvg ratingCount")
      .lean();

    return {
      request,
    };
  },

  async acceptRideRequest(userId, requestId) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    if (!profile.isOnline) {
      throw { status: 400, message: "Driver must be online to accept a request" };
    }

    if (profile.isBusy) {
      throw { status: 400, message: "Driver is already busy" };
    }

    const activeTrip = await getActiveTripForDriver(userId);
    if (activeTrip) {
      throw { status: 409, message: "Driver already has an active trip" };
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const rideRequest = await RideRequest.findOneAndUpdate(
        {
          _id: requestId,
          status: "searching",
        //   expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            status: "matched",
            matchedDriverId: userId,
          },
        },
        { new: true, session }
      );
      

      if (!rideRequest) {
        throw { status: 404, message: "Ride request not found or already taken" };
      }

      const trip = await Trip.create(
        [
          {
            requestId: rideRequest._id,
            riderId: rideRequest.riderId,
            driverId: userId,
            vehicleId: profile.activeVehicleId,
            pickup: rideRequest.pickup,
            dropoff: rideRequest.dropoff,
            status: "accepted",
            statusHistory: [
              {
                status: "accepted",
                at: new Date(),
                by: "driver",
              },
            ],
            pricing: {
              currency: rideRequest.quote.currency,
              baseFare: rideRequest.quote.baseFare,
              pricePerMile: 0,
              pricePerMinute: 0,
              surgeMultiplier: 1,
              driverSharePercent: rideRequest.quote.driverSharePercent,
              estimatedFare: rideRequest.quote.estimatedFare,
              finalFare: rideRequest.quote.estimatedFare,
            },
            rideOption: {
              vehicleType: rideRequest.preference?.vehicleType,
              tier: rideRequest.preference?.tier,
              size: rideRequest.preference?.size,
            },
          },
        ],
        { session }
      ).then((docs) => docs[0]);

      profile.isBusy = true;
      await profile.save({ session });

      await session.commitTransaction();

      return {
        message: "Ride request accepted successfully",
        trip,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },

  async getActiveTrip(userId) {
    await getDriverUser(userId);

    const trip = await Trip.findOne({
      driverId: userId,
      status: { $in: ACTIVE_TRIP_STATUSES },
    })
      .sort({ createdAt: -1 })
      .populate("riderId", "name profileImage ratingAvg ratingCount emergency")
      .populate("vehicleId", "brand model type size licensePlate")
      .lean();

    return {
      trip,
    };
  },

async arrivedAtPickup(userId, tripId) {
  await getDriverUser(userId);

  const now = new Date();
  const plainOtp = generateOtp();

  const trip = await Trip.findOneAndUpdate(
    {
      _id: tripId,
      driverId: userId,
      status: "accepted",
    },
    {
      $set: {
        status: "driver_arrived",
        otp: {
          hash: plainOtp,
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
          verifiedAt: null,
        },
      },
      $push: {
        statusHistory: {
          status: "driver_arrived",
          at: now,
          by: "driver",
        },
      },
    },
    { new: true }
  ).lean();

  if (!trip) {
    throw { status: 404, message: "Accepted trip not found" };
  }

  const rider = await User.findOne({
    _id: trip.riderId,
    role: "rider",
    isDeleted: { $ne: true },
  })
    .select("email")
    .lean();

  if (!rider) {
    throw { status: 404, message: "Rider not found" };
  }

  if (!rider.email) {
    throw { status: 400, message: "Rider email not found" };
  }

  sendEmail({
    to: rider.email,
    subject: "Trip Otp",
    text: `Hello,\n\nYour trip otp code is: ${plainOtp}\n\ngive the code to the driver to start the trip. The code expires in 10 minutes.`,
    html: `
<div style="font-family: Arial, sans-serif; line-height:1.6;">
  <h2>Ride Verification Code</h2>
  <p>Hello,</p>
  <p>Your driver has arrived at the pickup location. Please share the following OTP with the driver to start your trip:</p>
  <div style="background:#f0f0f0; padding:15px; margin:20px 0; font-size:30px; font-weight:bold; text-align:center; letter-spacing:4px;">
    ${plainOtp}
  </div>
  <p>This code will expire in <strong>10 minutes</strong>.</p>
</div>
`,
  }).catch((err) => {
    console.error("Failed to send trip OTP email:", err);
  });

  return {
    message: "Driver arrived at pickup and OTP sent to rider email",
    trip,
  };
},

  async verifyOtp(userId, tripId, payload) {
    await getDriverUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      driverId: userId,
      status: "driver_arrived",
    });

    if (!trip) {
      throw { status: 404, message: "Trip not found or not ready for OTP verification" };
    }

    const otp = payload?.otp;
    if (!otp) {
      throw { status: 400, message: "OTP is required" };
    }

    const isValid = compareOtp(otp, trip);
    if (!isValid) {
      throw { status: 400, message: "Invalid OTP" };
    }

    trip.status = "otp_verified";
    trip.otp.verifiedAt = new Date();
    trip.statusHistory.push({
      status: "otp_verified",
      at: new Date(),
      by: "driver",
    });

    await trip.save();

    return {
      message: "OTP verified successfully",
      trip,
    };
  },

  async startTrip(userId, tripId) {
    await getDriverUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      driverId: userId,
      status: { $in: ["driver_arrived", "otp_verified"] },
    });

    if (!trip) {
      throw { status: 404, message: "Trip not found or cannot be started" };
    }

    trip.status = "started";
    trip.statusHistory.push({
      status: "started",
      at: new Date(),
      by: "driver",
    });

    await trip.save();

    return {
      message: "Trip started successfully",
      trip,
    };
  },

  async getRiderProfile(userId, tripId) {
    await getDriverUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      driverId: userId,
    }).lean();

    if (!trip) {
      throw { status: 404, message: "Trip not found" };
    }

    const [rider, reviews] = await Promise.all([
      User.findById(trip.riderId).lean(),
      Rating.find({ toUserId: trip.riderId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("fromUserId", "name profileImage role")
        .lean(),
    ]);

    if (!rider) {
      throw { status: 404, message: "Rider not found" };
    }

    return {
      rider: {
        _id: rider._id,
        name: rider.name,
        profileImage: rider.profileImage,
        ratingAvg: rider.ratingAvg,
        ratingCount: rider.ratingCount,
      },
      reviews,
    };
  },

  async completeTrip(userId, tripId, payload) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      driverId: userId,
      status: "started",
    });

    if (!trip) {
      throw { status: 404, message: "Started trip not found" };
    }

    if (payload.distanceMiles !== undefined) {
      trip.distanceMiles = Number(payload.distanceMiles);
    }

    if (payload.durationMinutes !== undefined) {
      trip.durationMinutes = Number(payload.durationMinutes);
    }

    if (payload.finalFare !== undefined) {
      trip.pricing.finalFare = Number(payload.finalFare);
    }

    const { totalFare, driverGets, platformGets } = buildPaymentAmounts(trip);
    const paymentIsRequired = totalFare > 0;

    trip.status = "completed";
    trip.paymentStatus = paymentIsRequired ? "unpaid" : "paid";
    trip.statusHistory.push({
      status: "completed",
      at: new Date(),
      by: "driver",
    });

    await trip.save();

    await syncPaymentRecord(trip, {
      status: paymentIsRequired ? "pending" : "succeeded",
      paidAt: paymentIsRequired ? null : new Date(),
      failureMessage: null,
    });

    profile.isBusy = false;
    profile.tripsCount = Number(profile.tripsCount || 0) + 1;
    await profile.save();

    if (!paymentIsRequired) {
      await creditDriverEarnings(userId, driverGets);
    }

    return {
      message: paymentIsRequired
        ? "Trip completed successfully. Rider can now pay."
        : "Trip completed successfully",
      trip,
      paymentSummary: {
        totalFare,
        driverGets,
        platformGets,
        paymentStatus: trip.paymentStatus,
      },
    };
  },

  async cancelTrip(userId, tripId, payload) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      driverId: userId,
      status: { $in: ACTIVE_TRIP_STATUSES },
    });


    if (!trip) {
      throw { status: 404, message: "Active trip not found" };
    }

    trip.status = "cancelled";
    trip.cancellation = {
      canceledBy: "driver",
      reason: payload?.reason || "Cancelled by driver",
      canceledAt: new Date(),
      feeCharged: 0,
      rule: "DRIVER_CANCEL",
    };

    trip.statusHistory.push({
      status: "cancelled",
      at: new Date(),
      by: "driver",
    });

    await trip.save();

    profile.isBusy = false;
    await profile.save();

    return {
      message: "Trip cancelled successfully",
      trip,
    };
  },

  async getTripCompletionSummary(userId, tripId) {
    await getDriverUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      driverId: userId,
      status: { $in: ["completed", "cancelled"] },
    })
      .populate("riderId", "name profileImage ratingAvg")
      .lean();

    if (!trip) {
      throw { status: 404, message: "Trip summary not found" };
    }

    const payment = await Payment.findOne({ tripId: trip._id }).lean();

    return {
      trip,
      payment,
    };
  },
};
