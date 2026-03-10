// src/modules/rider-get-ride/riderGetRide.service.js

import { User } from "../models/User/User.model.js";
import { RiderProfile } from "../models/Rider_profile/Rider_profile.model.js";
import { RideRequest } from "../models/Ride_request/Ride_request.model.js";
import { Trip } from "../models/Trip/Trip.model.js";
import { FareConfig } from "../models/App_Config/App_Config.model.js";
import { Vehicle } from "../models/Vehicle/Vehicle.model.js";
import { Rating } from "../models/Rating/Rating.model.js";
import { SupportTicket } from "../models/Support_tickets/Support_tickets.model.js";

const ACTIVE_TRIP_STATUSES = ["accepted", "driver_arrived", "otp_verified", "started"];
const ACTIVE_REQUEST_STATUSES = ["searching", "matched"];

const getRiderUser = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (user.role !== "rider") {
    throw { status: 403, message: "Only rider can access this resource" };
  }

  return user;
};

const getActiveFareConfig = async () => {
  const config = await FareConfig.findOne({ active: true }).sort({ effectiveFrom: -1 }).lean();

  if (!config) {
    throw { status: 404, message: "Fare config not found" };
  }

  return config;
};

const getBaseFareKey = ({ vehicleType, tier, size }) => {
  if (vehicleType === "car") {
    return `car_${tier}`;
  }

  if (vehicleType === "suv") {
    return `suv_${size}_${tier}`;
  }

  if (vehicleType === "van") {
    return `van_${size}_${tier}`;
  }

  return null;
};

const calculateEstimate = ({
  config,
  vehicleType,
  tier,
  size,
  estimatedMiles = 0,
  estimatedMinutes = 0,
}) => {
  const fareKey = getBaseFareKey({ vehicleType, tier, size });
  const baseFare = fareKey ? config.baseFare?.[fareKey] || 0 : 0;

  const distanceFare = Number(estimatedMiles || 0) * Number(config.pricePerMile || 0);
  const timeFare = Number(estimatedMinutes || 0) * Number(config.pricePerMinute || 0);

  const estimatedFare = Number((baseFare + distanceFare + timeFare).toFixed(2));

  return {
    currency: config.currency,
    baseFare,
    estimatedMiles,
    estimatedMinutes,
    estimatedFare,
    pricePerMile: config.pricePerMile,
    pricePerMinute: config.pricePerMinute,
    driverSharePercent: config.driverSharePercent,
  };
};

const buildRideOptions = ({ config, estimatedMiles = 0, estimatedMinutes = 0 }) => {
  const options = [
    { vehicleType: "car", tier: "regular", size: "normal" },
    { vehicleType: "car", tier: "premium", size: "normal" },

    { vehicleType: "suv", tier: "regular", size: "compact" },
    { vehicleType: "suv", tier: "premium", size: "compact" },
    { vehicleType: "suv", tier: "regular", size: "full" },
    { vehicleType: "suv", tier: "premium", size: "full" },

    { vehicleType: "van", tier: "regular", size: "compact" },
    { vehicleType: "van", tier: "premium", size: "compact" },
    { vehicleType: "van", tier: "regular", size: "full" },
    { vehicleType: "van", tier: "premium", size: "full" },
  ];

  return options.map((item) => ({
    ...item,
    quote: calculateEstimate({
      config,
      vehicleType: item.vehicleType,
      tier: item.tier,
      size: item.size,
      estimatedMiles,
      estimatedMinutes,
    }),
  }));
};

const getCurrentRequestOrTrip = async (userId) => {
  const [activeRequest, activeTrip] = await Promise.all([
    RideRequest.findOne({
      riderId: userId,
      status: "searching",
    }).sort({ createdAt: -1 }).lean(),

    Trip.findOne({
      riderId: userId,
      status: { $in: ACTIVE_TRIP_STATUSES },
    }).sort({ createdAt: -1 }).lean(),
  ]);

  return { activeRequest, activeTrip };
};

const calculateCancellationFee = ({ trip }) => {
  if (!trip) return 0;

  if (trip.status === "accepted" || trip.status === "driver_arrived") {
    return Number(((trip.pricing?.estimatedFare || 0) * 0.6).toFixed(2));
  }

  if (trip.status === "started") {
    return Number(((trip.pricing?.finalFare || trip.pricing?.estimatedFare || 0) * 0.6).toFixed(2));
  }

  return 0;
};

export const riderGetRideService = {
  async getHome(userId) {
    const user = await getRiderUser(userId);

    let riderProfile = await RiderProfile.findOne({ userId }).lean();
    if (!riderProfile) {
      riderProfile = await RiderProfile.create({ userId }).then((doc) => doc.toObject());
    }

    const recentPlaces = (riderProfile.savedPlaces || []).slice(-5).reverse();

    const { activeRequest, activeTrip } = await getCurrentRequestOrTrip(userId);

    return {
      profile: {
        _id: user._id,
        name: user.name,
        profileImage: user.profileImage || null,
      },
      recentPlaces,
      activeRequest,
      activeTrip,
    };
  },

  async getRecentPlaces(userId) {
    await getRiderUser(userId);

    const riderProfile = await RiderProfile.findOne({ userId }).lean();

    return {
      places: riderProfile?.savedPlaces?.slice(-10).reverse() || [],
    };
  },

  async getRideOptions(userId, payload) {
    await getRiderUser(userId);

    const { estimatedMiles = 0, estimatedMinutes = 0 } = payload;
    const config = await getActiveFareConfig();

    return {
      currency: config.currency,
      options: buildRideOptions({ config, estimatedMiles, estimatedMinutes }),
    };
  },

  async createRideRequest(userId, payload) {
    await getRiderUser(userId);

    const { activeRequest, activeTrip } = await getCurrentRequestOrTrip(userId);
    console.log(activeRequest,"kdkd",activeTrip)
    if (activeRequest || activeTrip) {
      throw { status: 409, message: "You already have an active request or trip" };
    }

    const {
      pickup,
      dropoff,
      schedule,
      preference,
      estimatedMiles = 0,
      estimatedMinutes = 0,
    } = payload;

    const config = await getActiveFareConfig();

    const finalPreference = {
      vehicleType: preference?.vehicleType || "car",
      tier: preference?.tier || "regular",
      size: preference?.size || "normal",
    };

    const quote = calculateEstimate({
      config,
      vehicleType: finalPreference.vehicleType,
      tier: finalPreference.tier,
      size: finalPreference.size,
      estimatedMiles,
      estimatedMinutes,
    });

    const expiresAt = new Date(Date.now() + 45 * 1000);

    const rideRequest = await RideRequest.create({
      riderId: userId,
      pickup: {
        address: pickup.address,
        point: {
          type: "Point",
          coordinates: [pickup.lng, pickup.lat],
        },
      },
      dropoff: {
        address: dropoff.address,
        point: {
          type: "Point",
          coordinates: [dropoff.lng, dropoff.lat],
        },
      },
      schedule: {
        kind: schedule?.kind || "now",
        pickupAt: schedule?.pickupAt || null,
      },
      preference: finalPreference,
      quote,
      expiresAt,
      status: "searching",
    });

    // save recent places
    const riderProfile = await RiderProfile.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId },
        $push: {
          savedPlaces: {
            $each: [
              {
                label: pickup.label || pickup.address,
                address: pickup.address,
                location: {
                  type: "Point",
                  coordinates: [pickup.lng, pickup.lat],
                },
              },
              {
                label: dropoff.label || dropoff.address,
                address: dropoff.address,
                location: {
                  type: "Point",
                  coordinates: [dropoff.lng, dropoff.lat],
                },
              },
            ],
            $slice: -20,
          },
        },
      },
      { upsert: true, new: true }
    );

    return {
      rideRequest,
      recentPlacesCount: riderProfile?.savedPlaces?.length || 0,
    };
  },

  async getActive(userId) {
    await getRiderUser(userId);

    const { activeRequest, activeTrip } = await getCurrentRequestOrTrip(userId);

    return {
      activeRequest,
      activeTrip,
    };
  },

  async cancelRideRequest(userId, requestId) {
    await getRiderUser(userId);

    const rideRequest = await RideRequest.findOne({
      _id: requestId,
      riderId: userId,
      status: { $in: ACTIVE_REQUEST_STATUSES },
    });

    if (!rideRequest) {
      throw { status: 404, message: "Active ride request not found" };
    }

    rideRequest.status = "cancelled";
    await rideRequest.save();

    return {
      message: "Ride request cancelled successfully",
      rideRequest,
    };
  },

  async cancelTrip(userId, tripId, reason) {
    await getRiderUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
      status: { $in: ACTIVE_TRIP_STATUSES },
    });

    if (!trip) {
      throw { status: 404, message: "Active trip not found" };
    }

    const feeCharged = calculateCancellationFee({ trip });

    trip.status = "cancelled";
    trip.cancellation = {
      canceledBy: "rider",
      reason: reason || "Cancelled by rider",
      canceledAt: new Date(),
      feeCharged,
      rule: feeCharged > 0 ? "RIDER_CANCEL_60_PERCENT" : "NO_FEE",
    };

    trip.statusHistory.push({
      status: "cancelled",
      by: "rider",
      at: new Date(),
    });

    await trip.save();

    return {
      message: "Trip cancelled successfully",
      cancellationFee: feeCharged,
      trip,
    };
  },

  async checkFareAfterDestinationChange(userId, tripId, payload) {
    await getRiderUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
      status: "started",
    }).lean();

    if (!trip) {
      throw { status: 404, message: "Started trip not found" };
    }

    const config = await getActiveFareConfig();

    const vehicleType = trip.rideOption?.vehicleType || "car";
    const tier = trip.rideOption?.tier || "regular";
    const size = trip.rideOption?.size || "normal";

    const fare = calculateEstimate({
      config,
      vehicleType,
      tier,
      size,
      estimatedMiles: payload.estimatedMiles || trip.distanceMiles || 0,
      estimatedMinutes: payload.estimatedMinutes || trip.durationMinutes || 0,
    });

    return {
      newDestination: payload.dropoff,
      newFare: fare,
    };
  },

  async changeDestination(userId, tripId, payload) {
    await getRiderUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
      status: "started",
    });

    if (!trip) {
      throw { status: 404, message: "Started trip not found" };
    }

    const config = await getActiveFareConfig();

    const vehicleType = trip.rideOption?.vehicleType || "car";
    const tier = trip.rideOption?.tier || "regular";
    const size = trip.rideOption?.size || "normal";

    const newFare = calculateEstimate({
      config,
      vehicleType,
      tier,
      size,
      estimatedMiles: payload.estimatedMiles || trip.distanceMiles || 0,
      estimatedMinutes: payload.estimatedMinutes || trip.durationMinutes || 0,
    });

    trip.dropoff = {
      address: payload.dropoff.address,
      point: {
        type: "Point",
        coordinates: [payload.dropoff.lng, payload.dropoff.lat],
      },
    };

    trip.pricing.estimatedFare = newFare.estimatedFare;
    trip.pricing.baseFare = newFare.baseFare;
    trip.pricing.pricePerMile = newFare.pricePerMile;
    trip.pricing.pricePerMinute = newFare.pricePerMinute;

    await trip.save();

    return {
      message: "Destination changed successfully",
      trip,
      newFare,
    };
  },

  async getDriverProfile(userId, tripId) {
    await getRiderUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
    }).lean();

    if (!trip) {
      throw { status: 404, message: "Trip not found" };
    }

    const [driver, vehicle, reviews] = await Promise.all([
      User.findById(trip.driverId).lean(),
      trip.vehicleId ? Vehicle.findById(trip.vehicleId).lean() : null,
      Rating.find({ toUserId: trip.driverId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("fromUserId", "name profileImage role")
        .lean(),
    ]);

    if (!driver) {
      throw { status: 404, message: "Driver not found" };
    }

    return {
      driver: {
        _id: driver._id,
        name: driver.name,
        profileImage: driver.profileImage,
        ratingAvg: driver.ratingAvg,
        ratingCount: driver.ratingCount,
      },
      vehicle: vehicle
        ? {
            brand: vehicle.brand,
            model: vehicle.model,
            type: vehicle.type,
            size: vehicle.size,
            licensePlate: vehicle.licensePlate,
          }
        : null,
      reviews,
    };
  },

  async getTripDetails(userId, tripId) {
    await getRiderUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
    })
      .populate("driverId", "name profileImage ratingAvg ratingCount")
      .populate("vehicleId", "brand model type size licensePlate")
      .lean();

    if (!trip) {
      throw { status: 404, message: "Trip not found" };
    }

    return trip;
  },

  async submitRating(userId, tripId, payload) {
    await getRiderUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
      status: { $in: ["completed", "cancelled"] },
    });

    if (!trip) {
      throw { status: 404, message: "Completed/cancelled trip not found" };
    }

    const existing = await Rating.findOne({
      tripId,
      fromUserId: userId,
    });

    if (existing) {
      throw { status: 409, message: "You already rated this trip" };
    }

    const rating = await Rating.create({
      tripId,
      fromUserId: userId,
      toUserId: trip.driverId,
      stars: payload.stars,
      comment: payload.comment || "",
    });

    // update driver denormalized rating
    const ratings = await Rating.find({ toUserId: trip.driverId }).lean();
    const ratingCount = ratings.length;
    const ratingAvg =
      ratingCount > 0
        ? Number((ratings.reduce((sum, item) => sum + item.stars, 0) / ratingCount).toFixed(1))
        : 0;

    await User.findByIdAndUpdate(trip.driverId, {
      ratingAvg,
      ratingCount,
    });

    return {
      message: "Rating submitted successfully",
      rating,
    };
  },

  async createSupportTicket(userId, payload) {
    await getRiderUser(userId);

    const ticket = await SupportTicket.create({
      createdBy: userId,
      againstUserId: payload.againstUserId || null,
      tripId: payload.tripId || null,
      title: payload.title,
      message: payload.message,
      status: "pending",
    });

    return {
      message: "Support ticket created successfully",
      ticket,
    };
  },
};