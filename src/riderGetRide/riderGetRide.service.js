// src/modules/rider-get-ride/riderGetRide.service.js

import mongoose from "mongoose";
import { User } from "../models/User/User.model.js";
import { RiderProfile } from "../models/Rider_profile/Rider_profile.model.js";
import { RideRequest } from "../models/Ride_request/Ride_request.model.js";
import { Trip } from "../models/Trip/Trip.model.js";
import { FareConfig } from "../models/App_Config/App_Config.model.js";
import { Vehicle } from "../models/Vehicle/Vehicle.model.js";
import { Rating } from "../models/Rating/Rating.model.js";
import { SupportTicket } from "../models/Support_tickets/Support_tickets.model.js";
import { DriverProfile } from "../models/Driver_profile/Driver_profile.model.js";
import { Payment } from "../models/Payment/Payment.model.js";
import {
  assertStripeConfigured,
  getStripePublishableKey,
  stripe,
} from "../core_feature/utils/stripe/stripe.js";
import { findNearbyAvailableDrivers } from "../core_feature/utils/rideMatching/rideMatching.helper.js";
import { emitDriverQueuePayloadToUsers } from "../driverHome/driverRideRequestQueue.helper.js";
import { emitToUser, emitToUsers } from "../messages/socketRealtime.helper.js";

const ACTIVE_TRIP_STATUSES = ["accepted", "driver_arrived", "otp_verified", "started"];
const ACTIVE_REQUEST_STATUSES = ["searching", "matched"];
const RIDE_REQUEST_EXPIRY_MS = 5 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365 * MS_PER_DAY;



const mapDocument = (doc) => {
  if (!doc) return null;

  return {
    _id: doc._id,
    type: doc.type,
    fileUrl: doc.fileUrl,
    status: doc.status,
    rejectionReason: doc.rejectionReason || null,
    reviewedAt: doc.reviewedAt || null,
  };
};

const getYearsSince = (date) => {
  if (!date) {
    return 0;
  }

  const diffMs = Date.now() - new Date(date).getTime();
  const years = Math.floor(diffMs / MS_PER_YEAR);

  return Math.max(0, years);
};

const getDaysSince = (date) => {
  if (!date) {
    return 0;
  }

  const diffMs = Date.now() - new Date(date).getTime();
  const days = Math.floor(diffMs / MS_PER_DAY);

  return Math.max(0, days);
};

const buildPlatformDurationSummary = (profileCreatedAt, userCreatedAt) => {
  const createdAt = profileCreatedAt || userCreatedAt || null;

  return {
    profileCreatedAt: createdAt,
    daysOnPlatform: getDaysSince(createdAt),
    yearsOnPlatform: getYearsSince(createdAt),
  };
};

const mapReviewSummary = (review) => {
  if (!review) {
    return null;
  }

  return {
    _id: review._id,
    tripId: review.tripId,
    stars: review.stars,
    comment: review.comment || "",
    createdAt: review.createdAt,
  };
};

const mapDriverSummary = (driver) => {
  if (!driver) {
    return null;
  }

  return {
    _id: driver._id,
    name: driver.name,
    profileImage: driver.profileImage || null,
    ratingAvg: driver.ratingAvg || 0,
    ratingCount: driver.ratingCount || 0,
  };
};

const mapVehicleSummary = (vehicle) => {
  if (!vehicle) {
    return null;
  }

  return {
    _id: vehicle._id,
    brand: vehicle.brand,
    model: vehicle.model,
    type: vehicle.type,
    size: vehicle.size,
    licensePlate: vehicle.licensePlate || null,
  };
};

const buildTripCancelledPayload = (trip) => ({
  tripId: String(trip._id),
  status: trip.status,
  cancelledBy: trip?.cancellation?.canceledBy || null,
  cancellation: trip.cancellation || null,
  trip,
});

const buildTripFareSummary = (trip) => ({
  currency: (trip?.pricing?.currency || "USD").toUpperCase(),
  estimatedFare: Number(trip?.pricing?.estimatedFare || 0),
  finalFare: Number(trip?.pricing?.finalFare || 0),
  totalFare: Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0),
  pricePerMile: Number(trip?.pricing?.pricePerMile || 0),
  pricePerMinute: Number(trip?.pricing?.pricePerMinute || 0),
});

const mapTripHistoryItem = (trip, reviewGiven = null) => ({
  _id: trip._id,
  status: trip.status,
  paymentStatus: trip.paymentStatus,
  createdAt: trip.createdAt,
  updatedAt: trip.updatedAt,
  pickup: trip.pickup,
  dropoff: trip.dropoff,
  pickupAddress: trip.pickup?.address || null,
  destination: trip.dropoff?.address || null,
  distanceMiles: Number(trip.distanceMiles || 0),
  durationMinutes: Number(trip.durationMinutes || 0),
  fare: buildTripFareSummary(trip),
  rideOption: trip.rideOption || null,
  cancellation: trip.cancellation || null,
  driver: mapDriverSummary(trip.driverId),
  vehicle: mapVehicleSummary(trip.vehicleId),
  reviewGiven: mapReviewSummary(reviewGiven),
});

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

const calculateDistanceAndTimeFare = ({
  distanceMiles = 0,
  durationMinutes = 0,
  baseFare = 0,
  pricePerMinute = 0,
}) => {
  const distanceFare = Number(distanceMiles || 0) * Number(baseFare || 0);
  const timeFare = Number(durationMinutes || 0) * Number(pricePerMinute || 0);

  return Number((distanceFare + timeFare).toFixed(2));
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
  const estimatedFare = calculateDistanceAndTimeFare({
    distanceMiles: estimatedMiles,
    durationMinutes: estimatedMinutes,
    baseFare,
    pricePerMinute: config.pricePerMinute,
  });

  return {
    currency: config.currency,
    baseFare,
    estimatedMiles,
    estimatedMinutes,
    estimatedFare,
    pricePerMile: baseFare,
    pricePerMinute: config.pricePerMinute,
    driverSharePercent: Number(config.driverSharePercent ?? 0),
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

const buildDropoffPayload = (dropoff = {}) => {
  if (
    !dropoff ||
    !dropoff.address ||
    !Number.isFinite(Number(dropoff.lng)) ||
    !Number.isFinite(Number(dropoff.lat))
  ) {
    throw {
      status: 400,
      message: "dropoff.address, dropoff.lng and dropoff.lat are required",
    };
  }

  return {
    address: String(dropoff.address).trim(),
    point: {
      type: "Point",
      coordinates: [Number(dropoff.lng), Number(dropoff.lat)],
    },
  };
};

const buildRideLocationPayload = (location = {}, fieldName = "location") => {
  if (
    !location ||
    !location.address ||
    !Number.isFinite(Number(location.lng)) ||
    !Number.isFinite(Number(location.lat))
  ) {
    throw {
      status: 400,
      message: `${fieldName}.address, ${fieldName}.lng and ${fieldName}.lat are required`,
    };
  }

  return {
    address: String(location.address).trim(),
    point: {
      type: "Point",
      coordinates: [Number(location.lng), Number(location.lat)],
    },
  };
};

const toUniqueStringIds = (items = []) =>
  [...new Set(items.filter(Boolean).map((item) => String(item)))];

const splitDriverIdGroups = ({ previousDrivers = [], nextDrivers = [] }) => {
  const previousIds = toUniqueStringIds(previousDrivers.map((driver) => driver.driverId));
  const nextIds = toUniqueStringIds(nextDrivers.map((driver) => driver.driverId));

  return {
    added: nextIds.filter((id) => !previousIds.includes(id)),
    removed: previousIds.filter((id) => !nextIds.includes(id)),
    retained: nextIds.filter((id) => previousIds.includes(id)),
    current: nextIds,
  };
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

const findNearbyDriversForPickup = async ({ lng, lat }) => {
  const nearbyProfiles = await findNearbyAvailableDrivers({
    lng,
    lat,
    populate: true,
  });

  return nearbyProfiles
    .filter((profile) => profile.userId)
    .map((profile) => ({
      driverId: profile.userId._id,
      name: profile.userId.name,
      profileImage: profile.userId.profileImage || null,
      ratingAvg: profile.userId.ratingAvg || 0,
      ratingCount: profile.userId.ratingCount || 0,
      location: profile.location || null,
      vehicle: profile.activeVehicleId
        ? {
            _id: profile.activeVehicleId._id,
            brand: profile.activeVehicleId.brand,
            model: profile.activeVehicleId.model,
            type: profile.activeVehicleId.type,
            size: profile.activeVehicleId.size,
            licensePlate: profile.activeVehicleId.licensePlate || null,
          }
        : null,
    }));
};

const getRideRequestRealtimePayload = async (requestId) => {
  const request = await RideRequest.findById(requestId)
    .populate("riderId", "name profileImage ratingAvg ratingCount")
    .lean();

  return request;
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

const getOrCreateRiderProfile = async (userId) => {
  let riderProfile = await RiderProfile.findOne({ userId });

  if (!riderProfile) {
    riderProfile = await RiderProfile.create({ userId });
  }

  return riderProfile;
};

const getStripeObjectId = (value) => {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id || null;
};

const buildPaymentMethodSummary = (paymentMethod) => {
  if (!paymentMethod) {
    return null;
  }

  return {
    id: paymentMethod.id,
    type: paymentMethod.type || null,
    brand: paymentMethod.card?.brand || null,
    last4: paymentMethod.card?.last4 || null,
    expMonth: paymentMethod.card?.exp_month || null,
    expYear: paymentMethod.card?.exp_year || null,
  };
};

const getSavedPaymentMethodSummary = async (paymentMethodId) => {
  if (!paymentMethodId || !stripe) {
    return null;
  }

  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  return buildPaymentMethodSummary(paymentMethod);
};

const getCompletedTripForPayment = async (userId, tripId) => {
  const trip = await Trip.findOne({
    _id: tripId,
    riderId: userId,
    status: "completed",
  });

  if (!trip) {
    throw { status: 404, message: "Completed trip not found" };
  }

  return trip;
};

const buildTripPaymentAmounts = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  const driverSharePercent = Number(trip?.pricing?.driverSharePercent ?? 0);
  const driverGets = Number(((totalFare * driverSharePercent) / 100).toFixed(2));
  const platformGets = Number((totalFare - driverGets).toFixed(2));

  return {
    totalFare,
    driverGets,
    platformGets,
    currency: (trip?.pricing?.currency || "USD").toUpperCase(),
  };
};

const buildQuoteSummary = (quote = {}) => ({
  currency: (quote?.currency || "USD").toUpperCase(),
  estimatedMiles: Number(quote?.estimatedMiles || 0),
  estimatedMinutes: Number(quote?.estimatedMinutes || 0),
  baseFare: Number(quote?.baseFare || 0),
  pricePerMile: Number(quote?.pricePerMile || 0),
  pricePerMinute: Number(quote?.pricePerMinute || 0),
  estimatedFare: Number(quote?.estimatedFare || 0),
});

const upsertTripPaymentRecord = async (trip, overrides = {}, options = {}) => {
  const { totalFare, driverGets, platformGets, currency } = buildTripPaymentAmounts(trip);

  return Payment.findOneAndUpdate(
    { tripId: trip._id },
    {
      $set: {
        riderId: trip.riderId,
        driverId: trip.driverId,
        provider: "stripe",
        currency,
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
      ...options,
    }
  );
};

const getOrCreateStripeCustomer = async (riderUser, riderProfile) => {
  if (riderProfile?.stripeCustomerId) {
    return riderProfile.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    name: riderUser.name,
    email: riderUser.email || undefined,
    phone: riderUser.phone || undefined,
    metadata: {
      riderUserId: String(riderUser._id),
    },
  });

  riderProfile.stripeCustomerId = customer.id;
  await riderProfile.save();

  return customer.id;
};

const creditDriverAfterSuccessfulPayment = async (driverId, amount, session) => {
  if (Number(amount || 0) <= 0) {
    return;
  }

  const driverProfile = await DriverProfile.findOne({ userId: driverId }).session(session);
  if (!driverProfile) {
    return;
  }

  driverProfile.earningsTotal = Number(
    (Number(driverProfile.earningsTotal || 0) + Number(amount || 0)).toFixed(2)
  );

  await driverProfile.save({ session });
};

export const riderGetRideService = {
  async getHome(userId) {
    const user = await getRiderUser(userId);

    const riderProfile = await getOrCreateRiderProfile(userId);
    const riderProfileObject = riderProfile.toObject();

    const recentPlaces = (riderProfileObject.savedPlaces || []).slice(-5).reverse();

    const { activeRequest, activeTrip } = await getCurrentRequestOrTrip(userId);

    return {
      profile: {
        _id: user._id,
        name: user.name,
        profileImage: user.profileImage || null,
      },
      paymentMethod: {
        ready: Boolean(riderProfileObject.defaultPaymentMethodId),
        customerId: riderProfileObject.stripeCustomerId || null,
        defaultPaymentMethodId: riderProfileObject.defaultPaymentMethodId || null,
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

  async getNearbyOnlineDrivers(userId, payload) {
    await getRiderUser(userId);

    const lat = Number(payload?.lat);
    const lng = Number(payload?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw { status: 400, message: "Valid lat and lng are required" };
    }

    const nearbyDrivers = await findNearbyDriversForPickup({ lng, lat });
   

    return {
      drivers: nearbyDrivers,
      radiusKm: 10,
    };
  },

  async getPaymentMethodStatus(userId) {
    await getRiderUser(userId);

    const riderProfile = await getOrCreateRiderProfile(userId);
    const paymentMethod = await getSavedPaymentMethodSummary(riderProfile.defaultPaymentMethodId);

    return {
      stripeConfigured: Boolean(stripe),
      publishableKey: getStripePublishableKey(),
      customerId: riderProfile.stripeCustomerId || null,
      defaultPaymentMethodId: riderProfile.defaultPaymentMethodId || null,
      paymentMethod,
    };
  },

  async createPaymentSetupIntent(userId) {
    assertStripeConfigured();

    const riderUser = await getRiderUser(userId);
    const riderProfile = await getOrCreateRiderProfile(userId);
    const stripeCustomerId = await getOrCreateStripeCustomer(riderUser, riderProfile);

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        riderUserId: String(userId),
      },
    });

    return {
      message: "Payment setup intent created successfully",
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret,
      publishableKey: getStripePublishableKey(),
      customerId: stripeCustomerId,
      defaultPaymentMethodId: riderProfile.defaultPaymentMethodId || null,
      paymentMethod: await getSavedPaymentMethodSummary(riderProfile.defaultPaymentMethodId),
    };
  },

  async savePaymentMethod(userId, payload = {}) {
    assertStripeConfigured();

    const riderUser = await getRiderUser(userId);
    const riderProfile = await getOrCreateRiderProfile(userId);

    if (!payload?.setupIntentId) {
      throw { status: 400, message: "setupIntentId is required" };
    }

    const stripeCustomerId = await getOrCreateStripeCustomer(riderUser, riderProfile);
    const setupIntent = await stripe.setupIntents.retrieve(payload.setupIntentId);

    if (!setupIntent) {
      throw { status: 404, message: "Setup intent not found" };
    }

    if (setupIntent.status !== "succeeded") {
      throw { status: 400, message: "Card setup is not completed yet" };
    }

    const setupIntentCustomerId = getStripeObjectId(setupIntent.customer);
    if (setupIntentCustomerId && setupIntentCustomerId !== stripeCustomerId) {
      throw { status: 400, message: "Setup intent does not belong to this rider" };
    }

    const paymentMethodId = getStripeObjectId(setupIntent.payment_method);
    if (!paymentMethodId) {
      throw { status: 400, message: "Payment method not found on setup intent" };
    }

    let paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const paymentMethodCustomerId = getStripeObjectId(paymentMethod.customer);

    if (!paymentMethodCustomerId) {
      paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId,
      });
    } else if (paymentMethodCustomerId !== stripeCustomerId) {
      throw { status: 400, message: "Payment method does not belong to this rider" };
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    riderProfile.stripeCustomerId = stripeCustomerId;
    riderProfile.defaultPaymentMethodId = paymentMethodId;
    await riderProfile.save();

    return {
      message: "Payment method saved successfully",
      customerId: stripeCustomerId,
      defaultPaymentMethodId: paymentMethodId,
      paymentMethod: buildPaymentMethodSummary(paymentMethod),
      publishableKey: getStripePublishableKey(),
    };
  },

  async createRideRequest(userId, payload) {
    await getRiderUser(userId);

    const riderProfile = await getOrCreateRiderProfile(userId);
    if (!riderProfile.defaultPaymentMethodId) {
      throw {
        status: 400,
        message: "Add a card before requesting a trip",
      };
    }

    const { activeRequest, activeTrip } = await getCurrentRequestOrTrip(userId);
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

    const nearbyDrivers = await findNearbyDriversForPickup({
      lng: pickup.lng,
      lat: pickup.lat,
    });

    const expiresAt = new Date(Date.now() + RIDE_REQUEST_EXPIRY_MS);

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

    const liveRideRequest = await getRideRequestRealtimePayload(rideRequest._id);

    // save recent places
    const updatedRiderProfile = await RiderProfile.findOneAndUpdate(
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

    emitToUser(userId, "ride-request:created", {
      request: liveRideRequest,
      nearbyDriverCount: nearbyDrivers.length,
    });

    emitToUsers(
      nearbyDrivers.map((driver) => driver.driverId),
      "ride-request:new",
      {
        request: liveRideRequest,
      }
    );
    await emitDriverQueuePayloadToUsers(
      nearbyDrivers.map((driver) => driver.driverId),
      "request_created"
    );

    return {
      rideRequest: liveRideRequest,
      nearbyDrivers,
      recentPlacesCount: updatedRiderProfile?.savedPlaces?.length || 0,
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

  async getTrips(userId) {
    await getRiderUser(userId);

    const trips = await Trip.find({ riderId: userId })
      .sort({ createdAt: -1 })
      .populate("driverId", "name profileImage ratingAvg ratingCount")
      .populate("vehicleId", "brand model type size licensePlate")
      .lean();

    const tripIds = trips.map((trip) => trip._id);
    const reviewsGiven = tripIds.length
      ? await Rating.find({
          fromUserId: userId,
          tripId: { $in: tripIds },
        }).lean()
      : [];

    const reviewsByTripId = new Map(
      reviewsGiven.map((review) => [String(review.tripId), review])
    );

    return {
      trips: trips.map((trip) =>
        mapTripHistoryItem(trip, reviewsByTripId.get(String(trip._id)) || null)
      ),
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

    const nearbyDrivers =
      rideRequest.pickup?.point?.coordinates?.length === 2
        ? await findNearbyDriversForPickup({
            lng: rideRequest.pickup.point.coordinates[0],
            lat: rideRequest.pickup.point.coordinates[1],
          })
        : [];

    rideRequest.status = "cancelled";
    await rideRequest.save();

    emitToUser(userId, "ride-request:cancelled", {
      requestId: String(rideRequest._id),
    });

    emitToUsers(
      [
        ...nearbyDrivers.map((driver) => driver.driverId),
        rideRequest.matchedDriverId,
      ],
      "ride-request:removed",
      {
        requestId: String(rideRequest._id),
        reason: "cancelled",
      }
    );
    await emitDriverQueuePayloadToUsers(
      [...nearbyDrivers.map((driver) => driver.driverId), rideRequest.matchedDriverId],
      "request_cancelled"
    );

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

    const driverProfile = await DriverProfile.findOne({ userId: trip.driverId });

    if (driverProfile) {
      driverProfile.isBusy = false;
      await driverProfile.save();
    }

    emitToUsers([userId, trip.driverId], "trip:cancelled", buildTripCancelledPayload(trip));
    await emitDriverQueuePayloadToUsers([trip.driverId], "trip_cancelled");

    return {
      message: "Trip cancelled successfully",
      cancellationFee: feeCharged,
      trip,
    };
  },

  async changeRideRequestDestination(userId, requestId, payload) {
    await getRiderUser(userId);

    if (!payload?.pickup && !payload?.dropoff) {
      throw { status: 400, message: "pickup or dropoff is required" };
    }

    const rideRequest = await RideRequest.findOne({
      _id: requestId,
      riderId: userId,
      status: { $in: ACTIVE_REQUEST_STATUSES },
    });

    if (!rideRequest) {
      throw { status: 404, message: "Active ride request not found" };
    }

    const config = await getActiveFareConfig();
    const preference = rideRequest.preference || {};
    const shouldUpdatePickup = Boolean(payload?.pickup);
    const shouldUpdateDropoff = Boolean(payload?.dropoff);

    const previousNearbyDrivers =
      shouldUpdatePickup &&
      rideRequest.status === "searching" &&
      rideRequest.pickup?.point?.coordinates?.length === 2
        ? await findNearbyDriversForPickup({
            lng: rideRequest.pickup.point.coordinates[0],
            lat: rideRequest.pickup.point.coordinates[1],
          })
        : [];

    const newQuote = calculateEstimate({
      config,
      vehicleType: preference.vehicleType || "car",
      tier: preference.tier || "regular",
      size: preference.size || "normal",
      estimatedMiles: payload?.estimatedMiles ?? rideRequest.quote?.estimatedMiles ?? 0,
      estimatedMinutes: payload?.estimatedMinutes ?? rideRequest.quote?.estimatedMinutes ?? 0,
    });

    if (shouldUpdatePickup) {
      rideRequest.pickup = buildRideLocationPayload(payload.pickup, "pickup");
    }

    if (shouldUpdateDropoff) {
      rideRequest.dropoff = buildRideLocationPayload(payload.dropoff, "dropoff");
    }

    rideRequest.quote = {
      ...rideRequest.quote,
      ...newQuote,
    };

    await rideRequest.save();

    const liveRideRequest = await getRideRequestRealtimePayload(rideRequest._id);
    const currentNearbyDrivers =
      rideRequest.status === "searching" &&
      rideRequest.pickup?.point?.coordinates?.length === 2
        ? await findNearbyDriversForPickup({
            lng: rideRequest.pickup.point.coordinates[0],
            lat: rideRequest.pickup.point.coordinates[1],
          })
        : [];

    const { added, removed, retained, current } = splitDriverIdGroups({
      previousDrivers: previousNearbyDrivers,
      nextDrivers: currentNearbyDrivers,
    });

    emitToUser(userId, "ride-request:updated", {
      request: liveRideRequest,
      quote: newQuote,
      nearbyDriverCount: current.length,
    });

    if (rideRequest.matchedDriverId) {
      emitToUser(rideRequest.matchedDriverId, "ride-request:updated", {
        request: liveRideRequest,
        quote: newQuote,
      });
    }

    if (rideRequest.status === "searching") {
      if (shouldUpdatePickup) {
        emitToUsers(removed, "ride-request:removed", {
          requestId: String(rideRequest._id),
          reason: "pickup_changed",
        });

        emitToUsers(added, "ride-request:new", {
          request: liveRideRequest,
        });

        emitToUsers(retained, "ride-request:updated", {
          request: liveRideRequest,
          quote: newQuote,
        });
      } else {
        emitToUsers(current, "ride-request:updated", {
          request: liveRideRequest,
          quote: newQuote,
        });
      }

      await emitDriverQueuePayloadToUsers(
        [...removed, ...added, ...retained, ...current],
        shouldUpdatePickup ? "pickup_changed" : "request_updated"
      );
    }

    return {
      message: "Ride request locations changed successfully",
      rideRequest: liveRideRequest,
      newQuote,
      nearbyDrivers: currentNearbyDrivers,
    };
  },

  async checkRideRequestFare(userId, requestId, payload = {}) {
    await getRiderUser(userId);

    const rideRequest = await RideRequest.findOne({
      _id: requestId,
      riderId: userId,
      status: { $in: ACTIVE_REQUEST_STATUSES },
    }).lean();

    if (!rideRequest) {
      throw { status: 404, message: "Active ride request not found" };
    }

    const config = await getActiveFareConfig();
    const preference = rideRequest.preference || {};
    const checkedQuote = calculateEstimate({
      config,
      vehicleType: preference.vehicleType || "car",
      tier: preference.tier || "regular",
      size: preference.size || "normal",
      estimatedMiles: payload?.estimatedMiles ?? rideRequest.quote?.estimatedMiles ?? 0,
      estimatedMinutes: payload?.estimatedMinutes ?? rideRequest.quote?.estimatedMinutes ?? 0,
    });

    return {
      requestId: rideRequest._id,
      currentQuote: buildQuoteSummary(rideRequest.quote),
      checkedQuote: buildQuoteSummary(checkedQuote),
      pickup: payload?.pickup
        ? buildRideLocationPayload(payload.pickup, "pickup")
        : rideRequest.pickup,
      dropoff: payload?.dropoff
        ? buildRideLocationPayload(payload.dropoff, "dropoff")
        : rideRequest.dropoff,
      preference: rideRequest.preference || null,
    };
  },

  async changeDestination(userId, tripId, payload) {
    await getRiderUser(userId);

    if (!payload?.pickup && !payload?.dropoff) {
      throw { status: 400, message: "pickup or dropoff is required" };
    }

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
      status: { $in: ACTIVE_TRIP_STATUSES },
    });

    if (!trip) {
      throw { status: 404, message: "Active trip not found" };
    }

    if (payload?.pickup && trip.status === "started") {
      throw { status: 400, message: "Pickup cannot be changed after the trip has started" };
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
      estimatedMiles:
        payload?.estimatedMiles ?? trip.pricing?.estimatedMiles ?? trip.distanceMiles ?? 0,
      estimatedMinutes:
        payload?.estimatedMinutes ?? trip.pricing?.estimatedMinutes ?? trip.durationMinutes ?? 0,
    });

    if (payload?.pickup) {
      trip.pickup = buildRideLocationPayload(payload.pickup, "pickup");
    }

    if (payload?.dropoff) {
      trip.dropoff = buildRideLocationPayload(payload.dropoff, "dropoff");
    }

    trip.pricing.currency = newFare.currency;
    trip.pricing.estimatedMiles = Number(newFare.estimatedMiles || 0);
    trip.pricing.estimatedMinutes = Number(newFare.estimatedMinutes || 0);
    trip.pricing.estimatedFare = newFare.estimatedFare;
    trip.pricing.baseFare = newFare.baseFare;
    trip.pricing.pricePerMile = newFare.pricePerMile;
    trip.pricing.pricePerMinute = newFare.pricePerMinute;
    trip.pricing.driverSharePercent = newFare.driverSharePercent;
    if (trip.status !== "started") {
      trip.pricing.finalFare = newFare.estimatedFare;
    }

    await trip.save();

    if (trip.requestId) {
      const requestUpdate = {
        quote: {
          ...newFare,
        },
      };

      if (payload?.pickup) {
        requestUpdate.pickup = buildRideLocationPayload(payload.pickup, "pickup");
      }

      if (payload?.dropoff) {
        requestUpdate.dropoff = buildRideLocationPayload(payload.dropoff, "dropoff");
      }

      await RideRequest.findOneAndUpdate(
        {
          _id: trip.requestId,
          riderId: userId,
          status: { $in: ACTIVE_REQUEST_STATUSES },
        },
        { $set: requestUpdate }
      );
    }

    emitToUser(userId, "trip:destination-changed", {
      tripId: String(trip._id),
      trip,
      newFare,
    });

    emitToUser(trip.driverId, "trip:destination-changed", {
      tripId: String(trip._id),
      trip,
      newFare,
    });

    return {
      message: "Trip locations changed successfully",
      trip,
      newFare,
    };
  },

  async checkFareAfterDestinationChange(userId, tripId, payload = {}) {
    await getRiderUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      riderId: userId,
      status: { $in: ACTIVE_TRIP_STATUSES },
    }).lean();

    if (!trip) {
      throw { status: 404, message: "Active trip not found" };
    }

    const config = await getActiveFareConfig();
    const checkedFare = calculateEstimate({
      config,
      vehicleType: trip.rideOption?.vehicleType || "car",
      tier: trip.rideOption?.tier || "regular",
      size: trip.rideOption?.size || "normal",
      estimatedMiles: payload?.estimatedMiles ?? trip.pricing?.estimatedMiles ?? trip.distanceMiles ?? 0,
      estimatedMinutes:
        payload?.estimatedMinutes ?? trip.pricing?.estimatedMinutes ?? trip.durationMinutes ?? 0,
    });

    return {
      tripId: trip._id,
      currentFare: buildTripFareSummary(trip),
      checkedFare: buildQuoteSummary(checkedFare),
      pickup: payload?.pickup ? buildRideLocationPayload(payload.pickup, "pickup") : trip.pickup,
      dropoff: payload?.dropoff
        ? buildRideLocationPayload(payload.dropoff, "dropoff")
        : trip.dropoff,
      rideOption: trip.rideOption || null,
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

    const [driver, driverProfile, vehicle, reviews, completedTripsCount] = await Promise.all([
      User.findById(trip.driverId).lean(),
      DriverProfile.findOne({ userId: trip.driverId }).lean(),
      trip.vehicleId ? Vehicle.findById(trip.vehicleId).lean() : null,
      Rating.find({ toUserId: trip.driverId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("fromUserId", "name profileImage role")
        .lean(),
      Trip.countDocuments({ driverId: trip.driverId, status: "completed" }),
    ]);

    if (!driver) {
      throw { status: 404, message: "Driver not found" };
    }

    const platformDuration = buildPlatformDurationSummary(
      driverProfile?.createdAt,
      driver.createdAt
    );

    return {
      driver: {
        _id: driver._id,
        name: driver.name,
        profileImage: driver.profileImage,
        ratingAvg: driver.ratingAvg,
        ratingCount: driver.ratingCount,
        tripsCount: Math.max(
          Number(driverProfile?.tripsCount || 0),
          Number(completedTripsCount || 0)
        ),
        ...platformDuration,
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

  async getDriverReviews(userId, driverId) {
    await getRiderUser(userId);

    const [driver, driverProfile, vehicle, reviews] = await Promise.all([
      User.findOne({ _id: driverId, role: "driver", isDeleted: { $ne: true } }).lean(),
      DriverProfile.findOne({ userId: driverId }).lean(),
      Vehicle.findOne({ driverId, isActive: true }).lean(),
      Rating.find({ toUserId: driverId })
        .sort({ createdAt: -1 })
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
        profileImage: driver.profileImage || null,
        ratingAvg: driver.ratingAvg || 0,
        ratingCount: driver.ratingCount || 0,
        tripsCount: driverProfile?.tripsCount || 0,
        yearsOnPlatform: getYearsSince(driverProfile?.createdAt || driver.createdAt),
      },
      vehicle: vehicle
        ? {
            _id: vehicle._id,
            brand: vehicle.brand,
            model: vehicle.model,
            type: vehicle.type,
            size: vehicle.size,
            licensePlate: vehicle.licensePlate || null,
          }
        : null,
      reviews: reviews.map((review) => ({
        _id: review._id,
        stars: review.stars,
        comment: review.comment || "",
        createdAt: review.createdAt,
        reviewer: review.fromUserId
          ? {
              _id: review.fromUserId._id,
              name: review.fromUserId.name,
              profileImage: review.fromUserId.profileImage || null,
              role: review.fromUserId.role || null,
            }
          : null,
      })),
    };
  },

  async getTripDetails(userId, tripId) {
    await getRiderUser(userId);

    const [trip, reviewGiven, payment] = await Promise.all([
      Trip.findOne({
        _id: tripId,
        riderId: userId,
      })
        .populate("driverId", "name profileImage ratingAvg ratingCount")
        .populate("vehicleId", "brand model type size licensePlate")
        .lean(),
      Rating.findOne({
        tripId,
        fromUserId: userId,
      }).lean(),
      Payment.findOne({
        tripId,
        riderId: userId,
      }).lean(),
    ]);

    if (!trip) {
      throw { status: 404, message: "Trip not found" };
    }

    return {
      ...trip,
      driver: mapDriverSummary(trip.driverId),
      vehicle: mapVehicleSummary(trip.vehicleId),
      fare: buildTripFareSummary(trip),
      reviewGiven: mapReviewSummary(reviewGiven),
      payment: payment
        ? {
            _id: payment._id,
            status: payment.status,
            currency: payment.currency || null,
            totalFare: Number(payment.totalFare || 0),
            paidAt: payment.paidAt || null,
            failureMessage: payment.failureMessage || null,
          }
        : null,
    };
  },

  async getTripPaymentSummary(userId, tripId) {
    await getRiderUser(userId);

    const trip = await getCompletedTripForPayment(userId, tripId);
    const payment = await upsertTripPaymentRecord(trip);

    return {
      tripId: trip._id,
      tripStatus: trip.status,
      paymentStatus: trip.paymentStatus,
      amount: {
        currency: payment.currency,
        totalFare: payment.totalFare,
        driverGets: payment.driverGets,
        platformGets: payment.platformGets,
      },
      payment: {
        provider: payment.provider,
        status: payment.status,
        stripePaymentIntentId: payment.stripePaymentIntentId || null,
        stripePaymentMethodId: payment.stripePaymentMethodId || null,
        paidAt: payment.paidAt || null,
        failureMessage: payment.failureMessage || null,
      },
      publishableKey: getStripePublishableKey(),
    };
  },

  async createTripPaymentIntent(userId, tripId, payload = {}) {
    assertStripeConfigured();

    const riderUser = await getRiderUser(userId);
    const riderProfile = await getOrCreateRiderProfile(userId);
    const trip = await getCompletedTripForPayment(userId, tripId);

    if (trip.paymentStatus === "paid") {
      const existingPayment = await upsertTripPaymentRecord(trip, {
        status: "succeeded",
        paidAt: new Date(),
        failureMessage: null,
      });

      return {
        message: "Trip is already paid",
        alreadyPaid: true,
        paymentIntentId: existingPayment.stripePaymentIntentId || null,
        clientSecret: null,
        publishableKey: getStripePublishableKey(),
        payment: existingPayment,
      };
    }

    const payment = await upsertTripPaymentRecord(trip, {
      status: "pending",
      failureMessage: null,
    });

    if (payment.totalFare <= 0) {
      trip.paymentStatus = "paid";
      await trip.save();

      const zeroFarePayment = await upsertTripPaymentRecord(trip, {
        status: "succeeded",
        paidAt: new Date(),
        failureMessage: null,
      });

      return {
        message: "Trip does not require payment",
        alreadyPaid: true,
        paymentIntentId: zeroFarePayment.stripePaymentIntentId || null,
        clientSecret: null,
        publishableKey: getStripePublishableKey(),
        payment: zeroFarePayment,
      };
    }

    const stripeCustomerId = await getOrCreateStripeCustomer(riderUser, riderProfile);

    if (payment.stripePaymentIntentId) {
      const existingIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      if (
        ["requires_payment_method", "requires_confirmation", "requires_action", "processing"].includes(
          existingIntent.status
        )
      ) {
        await upsertTripPaymentRecord(trip, {
          stripeCustomerId,
          status: existingIntent.status === "requires_payment_method" ? "failed" : "pending",
          failureMessage: existingIntent.last_payment_error?.message || null,
        });

        return {
          message: "Existing payment intent fetched successfully",
          alreadyPaid: false,
          paymentIntentId: existingIntent.id,
          clientSecret: existingIntent.client_secret,
          publishableKey: getStripePublishableKey(),
          customerId: stripeCustomerId,
          amount: {
            currency: payment.currency,
            totalFare: payment.totalFare,
            driverGets: payment.driverGets,
            platformGets: payment.platformGets,
          },
        };
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(payment.totalFare) * 100),
      currency: String(payment.currency || "USD").toLowerCase(),
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      setup_future_usage: payload?.savePaymentMethod ? "off_session" : undefined,
      metadata: {
        tripId: String(trip._id),
        riderId: String(userId),
        driverId: String(trip.driverId),
      },
    });

    await upsertTripPaymentRecord(trip, {
      stripeCustomerId,
      stripePaymentIntentId: paymentIntent.id,
      status: "pending",
      failureMessage: null,
    });

    return {
      message: "Payment intent created successfully",
      alreadyPaid: false,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      publishableKey: getStripePublishableKey(),
      customerId: stripeCustomerId,
      amount: {
        currency: payment.currency,
        totalFare: payment.totalFare,
        driverGets: payment.driverGets,
        platformGets: payment.platformGets,
      },
      savedPaymentMethodId: riderProfile.defaultPaymentMethodId || null,
    };
  },

  async verifyTripPayment(userId, tripId, payload = {}) {
    assertStripeConfigured();

    await getRiderUser(userId);
    const trip = await getCompletedTripForPayment(userId, tripId);
    const riderProfile = await getOrCreateRiderProfile(userId);
    const payment = await upsertTripPaymentRecord(trip);

    const paymentIntentId = payload?.paymentIntentId || payment.stripePaymentIntentId;
    if (!paymentIntentId) {
      throw { status: 400, message: "Payment intent not found for this trip" };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent?.metadata?.tripId && paymentIntent.metadata.tripId !== String(trip._id)) {
      throw { status: 400, message: "Payment intent does not belong to this trip" };
    }

    const paymentMethodId =
      typeof paymentIntent.payment_method === "string"
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id || null;
    const stripeCustomerId =
      typeof paymentIntent.customer === "string"
        ? paymentIntent.customer
        : paymentIntent.customer?.id || riderProfile.stripeCustomerId || null;

    if (paymentIntent.status !== "succeeded") {
      const failedStatuses = ["requires_payment_method", "canceled"];
      const nextTripPaymentStatus = failedStatuses.includes(paymentIntent.status) ? "failed" : "unpaid";

      trip.paymentStatus = nextTripPaymentStatus;
      await trip.save();

      const failedPayment = await upsertTripPaymentRecord(trip, {
        stripeCustomerId,
        stripePaymentIntentId: paymentIntent.id,
        stripePaymentMethodId: paymentMethodId,
        status: failedStatuses.includes(paymentIntent.status) ? "failed" : "pending",
        failureMessage: paymentIntent.last_payment_error?.message || null,
        paidAt: null,
      });

      return {
        message: "Payment is not completed yet",
        tripPaymentStatus: trip.paymentStatus,
        paymentIntentStatus: paymentIntent.status,
        payment: failedPayment,
      };
    }

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const freshTrip = await Trip.findOne({
        _id: trip._id,
        riderId: userId,
        status: "completed",
      }).session(session);

      if (!freshTrip) {
        throw { status: 404, message: "Completed trip not found" };
      }

      const alreadyPaid = freshTrip.paymentStatus === "paid";
      freshTrip.paymentStatus = "paid";
      await freshTrip.save({ session });

      const settledPayment = await upsertTripPaymentRecord(
        freshTrip,
        {
          stripeCustomerId,
          stripePaymentIntentId: paymentIntent.id,
          stripePaymentMethodId: paymentMethodId,
          status: "succeeded",
          paidAt: new Date(),
          failureMessage: null,
        },
        { session }
      );

      const freshRiderProfile = await RiderProfile.findOne({ userId }).session(session);
      if (freshRiderProfile) {
        if (stripeCustomerId && !freshRiderProfile.stripeCustomerId) {
          freshRiderProfile.stripeCustomerId = stripeCustomerId;
        }

        if (payload?.savePaymentMethod && paymentMethodId) {
          freshRiderProfile.defaultPaymentMethodId = paymentMethodId;
        }

        await freshRiderProfile.save({ session });
      }

      if (!alreadyPaid) {
        await creditDriverAfterSuccessfulPayment(
          freshTrip.driverId,
          settledPayment.driverGets,
          session
        );
      }

      await session.commitTransaction();

      return {
        message: "Payment verified successfully",
        tripPaymentStatus: freshTrip.paymentStatus,
        paymentIntentStatus: paymentIntent.status,
        payment: settledPayment,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
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
