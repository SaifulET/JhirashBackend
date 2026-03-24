// src/modules/driver-home/driverHome.service.js

import mongoose from "mongoose";
import { User } from "../models/User/User.model.js";
import { DriverProfile } from "../models/Driver_profile/Driver_profile.model.js";
import { RiderProfile } from "../models/Rider_profile/Rider_profile.model.js";
import { Vehicle } from "../models/Vehicle/Vehicle.model.js";
import { RideRequest } from "../models/Ride_request/Ride_request.model.js";
import { Trip } from "../models/Trip/Trip.model.js";
import { Payment } from "../models/Payment/Payment.model.js";
import { Rating } from "../models/Rating/Rating.model.js";
import { DriverOnlineSession } from "../models/Driver_online_session/DriverOnlineSession.model.js";
import { stripe } from "../core_feature/utils/stripe/stripe.js";
import {
  DRIVER_DISPATCH_ELIGIBLE_STATUSES,
  findNearbyAvailableDrivers,
} from "../core_feature/utils/rideMatching/rideMatching.helper.js";
import { emitToUser, emitToUsers } from "../messages/socketRealtime.helper.js";
import {
  buildRideRequestQuery,
  emitDriverQueuePayloadToUsers,
  getDriverQueuePayload,
  getNearbyRideRequestsPayload,
  RIDE_REQUEST_RADIUS_KM,
  RIDE_REQUEST_RADIUS_MILES,
} from "./driverRideRequestQueue.helper.js";
import bcrypt from "bcryptjs";
const ACTIVE_TRIP_STATUSES = ["accepted", "driver_arrived", "otp_verified", "started"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365 * MS_PER_DAY;

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

const getActiveTripForDriver = async (userId) => {
  return Trip.findOne({
    driverId: userId,
    status: { $in: ACTIVE_TRIP_STATUSES },
  }).sort({ createdAt: -1 });
};

const isDriverDispatchEligible = (profile) =>
  DRIVER_DISPATCH_ELIGIBLE_STATUSES.includes(profile?.status);

const emitDriverQueueSync = async (driverId, driverProfile, triggeredBy) => {
  if (
    !driverProfile?.isOnline ||
    driverProfile?.isBusy ||
    !isDriverDispatchEligible(driverProfile)
  ) {
    emitToUser(driverId, "ride-request:queue", {
      requests: [],
      radiusMiles: RIDE_REQUEST_RADIUS_MILES,
      radiusKm: RIDE_REQUEST_RADIUS_KM,
      triggeredBy,
    });
    return;
  }

  const queue = await getDriverQueuePayload(driverProfile);

  emitToUser(driverId, "ride-request:queue", {
    ...queue,
    triggeredBy,
  });
};

const compareOtp = (plainOtp, trip) => {
  if (!trip?.otp?.hash) return false;
  return String(trip.otp.hash) === String(plainOtp);
};

const computeDriverGets = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  const percent = Number(trip?.pricing?.driverSharePercent ?? 0);
  return Number(((totalFare * percent) / 100).toFixed(2));
};

const calculateFareFromMetrics = ({
  distanceMiles = 0,
  durationMinutes = 0,
  baseFare = 0,
  pricePerMinute = 0,
}) => {
  const distanceFare = Number(distanceMiles || 0) * Number(baseFare || 0);
  const timeFare = Number(durationMinutes || 0) * Number(pricePerMinute || 0);

  return Number((distanceFare + timeFare).toFixed(2));
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

const toStripeAmount = (amount) => {
  return Math.max(0, Math.round(Number(amount || 0) * 100));
};

const getStripeObjectId = (value) => {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id || null;
};

const mapReviewList = (reviews = []) =>
  reviews.map((review) => ({
    _id: review._id,
    tripId: review.tripId,
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
  }));

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

const mapRiderSummary = (rider) => {
  if (!rider) {
    return null;
  }

  return {
    _id: rider._id,
    name: rider.name,
    profileImage: rider.profileImage || null,
    ratingAvg: rider.ratingAvg || 0,
    ratingCount: rider.ratingCount || 0,
    emergency: rider.emergency || null,
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

const buildTripFareSummary = (trip) => ({
  currency: (trip?.pricing?.currency || "USD").toUpperCase(),
  estimatedFare: Number(trip?.pricing?.estimatedFare || 0),
  finalFare: Number(trip?.pricing?.finalFare || 0),
  totalFare: Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0),
  driverGets: computeDriverGets(trip),
  platformGets: computePlatformGets(trip),
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
  rider: mapRiderSummary(trip.riderId),
  vehicle: mapVehicleSummary(trip.vehicleId),
  reviewGiven: mapReviewSummary(reviewGiven),
});

const MINUTE_IN_MS = 60 * 1000;
const EARTH_RADIUS_METERS = 6371000;
const APPROX_CITY_SPEED_METERS_PER_MINUTE = 300;

const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getUtcPeriodBounds = ({ period = "week", year, month, week }) => {
  const normalizedYear = Number(year);

  if (!Number.isInteger(normalizedYear)) {
    throw { status: 400, message: "A valid year is required" };
  }

  if (period === "year") {
    return {
      start: new Date(Date.UTC(normalizedYear, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(normalizedYear + 1, 0, 1, 0, 0, 0, 0)),
      label: String(normalizedYear),
    };
  }

  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
    throw { status: 400, message: "A valid month between 1 and 12 is required" };
  }

  if (period === "month") {
    return {
      start: new Date(Date.UTC(normalizedYear, normalizedMonth - 1, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(normalizedYear, normalizedMonth, 1, 0, 0, 0, 0)),
      label: `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`,
    };
  }

  const normalizedWeek = Number(week);
  if (!Number.isInteger(normalizedWeek) || normalizedWeek < 1 || normalizedWeek > 6) {
    throw { status: 400, message: "A valid week between 1 and 6 is required" };
  }

  const monthEnd = new Date(Date.UTC(normalizedYear, normalizedMonth, 1, 0, 0, 0, 0));
  const start = new Date(
    Date.UTC(normalizedYear, normalizedMonth - 1, 1 + (normalizedWeek - 1) * 7, 0, 0, 0, 0)
  );

  if (start >= monthEnd) {
    throw { status: 400, message: "Selected week is out of range for the month" };
  }

  const end = new Date(
    Math.min(
      monthEnd.getTime(),
      Date.UTC(normalizedYear, normalizedMonth - 1, 1 + normalizedWeek * 7, 0, 0, 0, 0)
    )
  );

  return {
    start,
    end,
    label: `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}-week-${normalizedWeek}`,
  };
};

const formatDuration = (minutes) => {
  const totalMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  return {
    minutes: totalMinutes,
    hours,
    human: `${hours}h ${remainingMinutes}m`,
  };
};

const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;

const calculateDistanceMeters = (fromCoordinates = [], toCoordinates = []) => {
  if (
    !Array.isArray(fromCoordinates) ||
    !Array.isArray(toCoordinates) ||
    fromCoordinates.length !== 2 ||
    toCoordinates.length !== 2
  ) {
    return null;
  }

  const [fromLng, fromLat] = fromCoordinates.map(Number);
  const [toLng, toLat] = toCoordinates.map(Number);

  if (
    !Number.isFinite(fromLng) ||
    !Number.isFinite(fromLat) ||
    !Number.isFinite(toLng) ||
    !Number.isFinite(toLat)
  ) {
    return null;
  }

  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const startLat = toRadians(fromLat);
  const endLat = toRadians(toLat);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine)));
};

const buildEtaMinutes = (distanceMeters) => {
  if (!Number.isFinite(Number(distanceMeters))) {
    return null;
  }

  return Math.max(1, Math.ceil(Number(distanceMeters) / APPROX_CITY_SPEED_METERS_PER_MINUTE));
};

const buildDriverProgressPayload = ({ driverProfile, targetPoint, targetLabel = "pickup" }) => {
  const driverCoordinates = driverProfile?.location?.point?.coordinates;
  const targetCoordinates = targetPoint?.coordinates;
  const distanceMeters = calculateDistanceMeters(driverCoordinates, targetCoordinates);

  if (!Number.isFinite(distanceMeters)) {
    return {
      target: targetLabel,
      currentLocation: driverProfile?.location || null,
      distanceMeters: null,
      distanceKm: null,
      etaMinutes: null,
      updatedAt: driverProfile?.location?.updatedAt || null,
    };
  }

  return {
    target: targetLabel,
    currentLocation: driverProfile?.location || null,
    distanceMeters,
    distanceKm: Number((distanceMeters / 1000).toFixed(2)),
    etaMinutes: buildEtaMinutes(distanceMeters),
    updatedAt: driverProfile?.location?.updatedAt || null,
  };
};

const buildRealtimeMatchedPayload = ({
  trip,
  rideRequest,
  driverUser,
  driverProfile,
  vehicle,
}) => ({
  requestId: String(rideRequest._id),
  matchedDriverId: String(driverUser._id),
  trip,
  driver: {
    _id: driverUser._id,
    name: driverUser.name,
    profileImage: driverUser.profileImage || null,
    ratingAvg: Number(driverUser.ratingAvg || 0),
    ratingCount: Number(driverUser.ratingCount || 0),
    tripsCount: Number(driverProfile?.tripsCount || 0),
    phone: driverUser.phone || null,
  },
  vehicle: mapVehicleSummary(vehicle),
  fare: {
    currency: (trip?.pricing?.currency || "USD").toUpperCase(),
    estimatedFare: Number(trip?.pricing?.estimatedFare || 0),
    finalFare: Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0),
  },
  otp: {
    code: trip?.otp?.hash || null,
    expiresAt: trip?.otp?.expiresAt || null,
  },
  pickupProgress: buildDriverProgressPayload({
    driverProfile,
    targetPoint: trip?.pickup?.point,
    targetLabel: "pickup",
  }),
  note: {
    pickupInstruction: "Meet at the pickup location",
    otpInstruction: "Share OTP with driver to start the trip",
    cancellationRule: "If cancelled late, up to 60% of the fare may be charged",
  },
});

const buildAvailablePeriods = (trips = []) => {
  const years = new Map();

  for (const trip of trips) {
    const date = new Date(trip.createdAt);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const week = Math.floor((day - 1) / 7) + 1;

    if (!years.has(year)) {
      years.set(year, new Map());
    }

    const months = years.get(year);
    if (!months.has(month)) {
      months.set(month, new Set());
    }

    months.get(month).add(week);
  }

  return Array.from(years.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([month, weeks]) => ({
          month,
          weeks: Array.from(weeks).sort((a, b) => a - b),
        })),
    }));
};

const calculateSessionOverlapMinutes = (session, start, end) => {
  const sessionStart = new Date(session.startedAt).getTime();
  const sessionEnd = new Date(session.endedAt || new Date()).getTime();
  const overlapStart = Math.max(sessionStart, start.getTime());
  const overlapEnd = Math.min(sessionEnd, end.getTime());

  if (overlapEnd <= overlapStart) {
    return 0;
  }

  return Number(((overlapEnd - overlapStart) / MINUTE_IN_MS).toFixed(2));
};

const ensureActiveOnlineSession = async (driverId) => {
  const existingSession = await DriverOnlineSession.findOne({
    driverId,
    endedAt: null,
  }).sort({ startedAt: -1 });

  if (existingSession) {
    return existingSession;
  }

  return DriverOnlineSession.create({
    driverId,
    startedAt: new Date(),
  });
};

const closeActiveOnlineSession = async (driverId) => {
  const activeSession = await DriverOnlineSession.findOne({
    driverId,
    endedAt: null,
  }).sort({ startedAt: -1 });

  if (!activeSession) {
    return null;
  }

  const endedAt = new Date();
  activeSession.endedAt = endedAt;
  activeSession.durationMinutes = calculateSessionOverlapMinutes(
    { startedAt: activeSession.startedAt, endedAt },
    new Date(activeSession.startedAt),
    endedAt
  );
  await activeSession.save();

  return activeSession;
};

const syncIneligibleDriverOfflineState = async (driverId, profile) => {
  if (!profile || isDriverDispatchEligible(profile) || (!profile.isOnline && !profile.isBusy)) {
    return profile;
  }

  profile.isOnline = false;
  profile.isBusy = false;
  await profile.save();
  await closeActiveOnlineSession(driverId);

  return profile;
};

const syncUserRatingSummary = async (userId) => {
  const ratings = await Rating.find({ toUserId: userId }).lean();
  const ratingCount = ratings.length;
  const ratingAvg =
    ratingCount > 0
      ? Number((ratings.reduce((sum, item) => sum + item.stars, 0) / ratingCount).toFixed(1))
      : 0;

  await User.findByIdAndUpdate(userId, {
    ratingAvg,
    ratingCount,
  });

  return { ratingAvg, ratingCount };
};

const buildAutoChargeResult = (payload = {}) => ({
  attempted: false,
  succeeded: false,
  status: "not_attempted",
  failureMessage: null,
  paymentIntentId: null,
  paymentMethodId: null,
  stripeCustomerId: null,
  ...payload,
});

const attemptAutomaticTripCharge = async ({ trip, riderProfile, driverProfile }) => {
  if (!stripe) {
    return buildAutoChargeResult({
      status: "stripe_unavailable",
      failureMessage: "Stripe is not configured",
    });
  }

  if (!riderProfile?.stripeCustomerId || !riderProfile?.defaultPaymentMethodId) {
    return buildAutoChargeResult({
      status: "missing_payment_method",
      failureMessage: "Rider has no saved card for automatic charging",
      stripeCustomerId: riderProfile?.stripeCustomerId || null,
      paymentMethodId: riderProfile?.defaultPaymentMethodId || null,
    });
  }

  const { totalFare, driverGets, platformGets } = buildPaymentAmounts(trip);
  if (totalFare <= 0) {
    return buildAutoChargeResult({
      status: "not_required",
      stripeCustomerId: riderProfile.stripeCustomerId,
      paymentMethodId: riderProfile.defaultPaymentMethodId,
    });
  }

  const paymentIntentPayload = {
    amount: toStripeAmount(totalFare),
    currency: String(trip?.pricing?.currency || "USD").toLowerCase(),
    customer: riderProfile.stripeCustomerId,
    payment_method: riderProfile.defaultPaymentMethodId,
    confirm: true,
    off_session: true,
    metadata: {
      tripId: String(trip._id),
      riderId: String(trip.riderId),
      driverId: String(trip.driverId),
      autoCharge: "true",
    },
  };

  if (driverProfile?.stripeConnected && driverProfile?.stripeAccountId) {
    paymentIntentPayload.transfer_data = {
      destination: driverProfile.stripeAccountId,
    };
    paymentIntentPayload.application_fee_amount = toStripeAmount(platformGets);
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentPayload);

    return buildAutoChargeResult({
      attempted: true,
      succeeded: paymentIntent.status === "succeeded",
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
      paymentMethodId:
        getStripeObjectId(paymentIntent.payment_method) || riderProfile.defaultPaymentMethodId,
      stripeCustomerId:
        getStripeObjectId(paymentIntent.customer) || riderProfile.stripeCustomerId,
      failureMessage: paymentIntent.last_payment_error?.message || null,
      driverGets,
      platformGets,
    });
  } catch (error) {
    const paymentIntent = error?.payment_intent || error?.raw?.payment_intent || null;

    return buildAutoChargeResult({
      attempted: true,
      succeeded: false,
      status: paymentIntent?.status || "failed",
      paymentIntentId: paymentIntent?.id || null,
      paymentMethodId:
        getStripeObjectId(paymentIntent?.payment_method) || riderProfile.defaultPaymentMethodId,
      stripeCustomerId:
        getStripeObjectId(paymentIntent?.customer) || riderProfile.stripeCustomerId,
      failureMessage: error?.raw?.message || error?.message || "Automatic payment failed",
      driverGets,
      platformGets,
    });
  }
};

export const driverHomeService = {
  async getHome(userId) {
    const user = await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);
    await syncIneligibleDriverOfflineState(userId, profile);

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
    const hasIncomingLocation = payload?.lat !== undefined && payload?.lng !== undefined;

    if (!isDriverDispatchEligible(profile)) {
      await syncIneligibleDriverOfflineState(userId, profile);
      throw { status: 400, message: "Only active drivers can go online" };
    }

    if (!profile.activeVehicleId) {
      throw { status: 400, message: "Active vehicle is required" };
    }

    if (!hasIncomingLocation && !profile.location?.updatedAt) {
      throw { status: 400, message: "Driver location is required before going online" };
    }

    if (hasIncomingLocation) {
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
    await ensureActiveOnlineSession(userId);

    await emitDriverQueueSync(userId, profile, "driver_online");

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
    await closeActiveOnlineSession(userId);

    emitToUser(userId, "ride-request:queue", {
      requests: [],
      radiusMiles: RIDE_REQUEST_RADIUS_MILES,
      radiusKm: RIDE_REQUEST_RADIUS_KM,
      triggeredBy: "driver_offline",
    });

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

    await emitDriverQueueSync(userId, profile, "location_update");

    const activeTrip = await getActiveTripForDriver(userId);
    if (activeTrip?.riderId) {
      const targetPoint =
        activeTrip.status === "started" ? activeTrip.dropoff?.point : activeTrip.pickup?.point;
      const targetLabel = activeTrip.status === "started" ? "dropoff" : "pickup";

      emitToUser(activeTrip.riderId, "trip:driver-location", {
        tripId: String(activeTrip._id),
        driverId: String(userId),
        status: activeTrip.status,
        progress: buildDriverProgressPayload({
          driverProfile: profile,
          targetPoint,
          targetLabel,
        }),
      });
    }

    return {
      message: "Driver location updated",
      location: profile.location,
    };
  },

  async getNextRideRequest(userId) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    if (!profile.isOnline || profile.isBusy || !isDriverDispatchEligible(profile)) {
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

  async getNearbyRideRequests(userId) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);

    if (!profile.isOnline || profile.isBusy || !isDriverDispatchEligible(profile)) {
      return {
        requests: [],
      };
    }

    return getNearbyRideRequestsPayload(profile);
  },

  async acceptRideRequest(userId, requestId) {
    await getDriverUser(userId);
    const profile = await getDriverProfileOrFail(userId);
    const now = new Date();
    const plainOtp = generateOtp();

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
          expiresAt: { $gt: new Date() },
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
            otp: {
              hash: plainOtp,
              expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
              verifiedAt: null,
            },
            statusHistory: [
              {
                status: "accepted",
                at: now,
                by: "driver",
              },
            ],
            pricing: {
              currency: rideRequest.quote.currency,
              baseFare: rideRequest.quote.baseFare,
              pricePerMile: rideRequest.quote.pricePerMile,
              pricePerMinute: rideRequest.quote.pricePerMinute,
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

      const [driverUser, vehicle] = await Promise.all([
        User.findById(userId)
          .select("name profileImage ratingAvg ratingCount phone")
          .lean(),
        profile.activeVehicleId ? Vehicle.findById(profile.activeVehicleId).lean() : null,
      ]);

      const matchedPayload = buildRealtimeMatchedPayload({
        trip,
        rideRequest,
        driverUser,
        driverProfile: profile,
        vehicle,
      });

      const nearbyDriverProfiles =
        rideRequest.pickup?.point?.coordinates?.length === 2
          ? await findNearbyAvailableDrivers({
              lng: rideRequest.pickup.point.coordinates[0],
              lat: rideRequest.pickup.point.coordinates[1],
            })
          : [];

      emitToUser(rideRequest.riderId, "ride-request:matched", {
        ...matchedPayload,
      });

      emitToUser(userId, "ride-request:accepted", {
        requestId: String(rideRequest._id),
        trip,
      });

      emitToUsers(
        nearbyDriverProfiles.map((item) => item.userId),
        "ride-request:removed",
        {
          requestId: String(rideRequest._id),
          reason: "matched",
        }
      );

      await emitDriverQueuePayloadToUsers(
        nearbyDriverProfiles.map((item) => item.userId),
        "request_matched"
      );
      await emitDriverQueueSync(userId, profile, "request_accepted");

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

  async getTrips(userId) {
    await getDriverUser(userId);

    const trips = await Trip.find({ driverId: userId })
      .sort({ createdAt: -1 })
      .populate("riderId", "name profileImage ratingAvg ratingCount emergency")
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

  async getEarningsSummary(userId, query = {}) {
    const user = await getDriverUser(userId);
    await getDriverProfileOrFail(userId);

    const period = ["week", "month", "year"].includes(query.period) ? query.period : "week";

    const completedTrips = await Trip.find({
      driverId: userId,
      status: "completed",
    })
      .select("createdAt pricing distanceMiles durationMinutes paymentStatus")
      .sort({ createdAt: -1 })
      .lean();

    const availablePeriods = buildAvailablePeriods(completedTrips);

    const fallbackDate = completedTrips[0]?.createdAt || user.createdAt || new Date();
    const fallbackYear = new Date(fallbackDate).getUTCFullYear();
    const fallbackMonth = new Date(fallbackDate).getUTCMonth() + 1;
    const fallbackWeek = Math.floor((new Date(fallbackDate).getUTCDate() - 1) / 7) + 1;

    const { start, end, label } = getUtcPeriodBounds({
      period,
      year: query.year ?? fallbackYear,
      month: query.month ?? fallbackMonth,
      week: query.week ?? fallbackWeek,
    });

    const filteredTrips = completedTrips.filter((trip) => {
      const createdAt = new Date(trip.createdAt);
      return createdAt >= start && createdAt < end;
    });

    const [periodRatings, overallRatings, onlineSessions, allOnlineSessions] = await Promise.all([
      Rating.find({
        toUserId: userId,
        createdAt: { $gte: start, $lt: end },
      })
        .select("stars")
        .lean(),
      Rating.find({ toUserId: userId })
        .select("stars")
        .lean(),
      DriverOnlineSession.find({
        driverId: userId,
        startedAt: { $lt: end },
        $or: [{ endedAt: null }, { endedAt: { $gt: start } }],
      })
        .select("startedAt endedAt durationMinutes")
        .lean(),
      DriverOnlineSession.find({
        driverId: userId,
      })
        .select("startedAt endedAt durationMinutes")
        .lean(),
    ]);

    const earnings = filteredTrips.reduce((sum, trip) => sum + computeDriverGets(trip), 0);
    const tripCount = filteredTrips.length;
    const totalDistanceMiles = filteredTrips.reduce(
      (sum, trip) => sum + toPositiveNumber(trip.distanceMiles),
      0
    );
    const totalDurationMinutes = filteredTrips.reduce(
      (sum, trip) => sum + toPositiveNumber(trip.durationMinutes),
      0
    );
    const paidTrips = filteredTrips.filter((trip) => trip.paymentStatus === "paid").length;
    const unpaidTrips = filteredTrips.filter((trip) => trip.paymentStatus !== "paid").length;
    const onlineMinutes = onlineSessions.reduce(
      (sum, session) => sum + calculateSessionOverlapMinutes(session, start, end),
      0
    );
    const overallOnlineMinutes = allOnlineSessions.reduce(
      (sum, session) =>
        sum +
        calculateSessionOverlapMinutes(
          session,
          new Date(session.startedAt),
          new Date(session.endedAt || new Date())
        ),
      0
    );
    const overallEarnings = completedTrips.reduce((sum, trip) => sum + computeDriverGets(trip), 0);
    const overallDistanceMiles = completedTrips.reduce(
      (sum, trip) => sum + toPositiveNumber(trip.distanceMiles),
      0
    );
    const overallDurationMinutes = completedTrips.reduce(
      (sum, trip) => sum + toPositiveNumber(trip.durationMinutes),
      0
    );

    const periodRatingCount = periodRatings.length;
    const periodRatingAverage =
      periodRatingCount > 0
        ? Number(
            (
              periodRatings.reduce((sum, rating) => sum + Number(rating.stars || 0), 0) /
              periodRatingCount
            ).toFixed(1)
          )
        : 0;

    const overallRatingCount = overallRatings.length;
    const overallRatingAverage =
      overallRatingCount > 0
        ? Number(
            (
              overallRatings.reduce((sum, rating) => sum + Number(rating.stars || 0), 0) /
              overallRatingCount
            ).toFixed(1)
          )
        : 0;

    return {
      filter: {
        period,
        year: start.getUTCFullYear(),
        month: period === "year" ? null : start.getUTCMonth() + 1,
        week: period === "week" ? Math.floor((start.getUTCDate() - 1) / 7) + 1 : null,
        label,
        startAt: start,
        endAt: end,
      },
      currency: "USD",
      summary: {
        earnings: Number(earnings.toFixed(2)),
        trips: tripCount,
        paidTrips,
        unpaidTrips,
        totalDistanceMiles: Number(totalDistanceMiles.toFixed(2)),
        tripDuration: formatDuration(totalDurationMinutes),
        onlineTime: formatDuration(onlineMinutes),
        rating: {
          periodAverage: periodRatingAverage,
          periodCount: periodRatingCount,
          overallAverage: overallRatingAverage,
          overallCount: overallRatingCount,
        },
      },
      overall: {
        earnings: Number(overallEarnings.toFixed(2)),
        trips: completedTrips.length,
        totalDistanceMiles: Number(overallDistanceMiles.toFixed(2)),
        tripDuration: formatDuration(overallDurationMinutes),
        onlineTime: formatDuration(overallOnlineMinutes),
        rating: {
          average: overallRatingAverage,
          count: overallRatingCount,
        },
      },
      availablePeriods,
    };
  },

async arrivedAtPickup(userId, tripId) {
  await getDriverUser(userId);

  const now = new Date();

  const trip = await Trip.findOneAndUpdate(
    {
      _id: tripId,
      driverId: userId,
      status: "accepted",
    },
    {
      $set: {
        status: "driver_arrived",
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

  return {
    message: "Driver arrived at pickup successfully",
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

    const [rider, riderProfile, reviews, completedTripsCount] = await Promise.all([
      User.findById(trip.riderId).lean(),
      RiderProfile.findOne({ userId: trip.riderId }).lean(),
      Rating.find({ toUserId: trip.riderId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("fromUserId", "name profileImage role")
        .lean(),
      Trip.countDocuments({ riderId: trip.riderId, status: "completed" }),
    ]);

    if (!rider) {
      throw { status: 404, message: "Rider not found" };
    }

    const platformDuration = buildPlatformDurationSummary(
      riderProfile?.createdAt,
      rider.createdAt
    );

    return {
      rider: {
        _id: rider._id,
        name: rider.name,
        profileImage: rider.profileImage,
        ratingAvg: rider.ratingAvg,
        ratingCount: rider.ratingCount,
        tripsCount: Number(completedTripsCount || 0),
        ...platformDuration,
      },
      reviews,
    };
  },

  async getRiderReviews(userId, riderId) {
    await getDriverUser(userId);

    const [rider, riderProfile, reviews] = await Promise.all([
      User.findOne({ _id: riderId, role: "rider", isDeleted: { $ne: true } }).lean(),
      RiderProfile.findOne({ userId: riderId }).lean(),
      Rating.find({ toUserId: riderId })
        .sort({ createdAt: -1 })
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
        profileImage: rider.profileImage || null,
        ratingAvg: rider.ratingAvg || 0,
        ratingCount: rider.ratingCount || 0,
        savedPlacesCount: riderProfile?.savedPlaces?.length || 0,
      },
      reviews: mapReviewList(reviews),
    };
  },

  async submitRiderRating(userId, tripId, payload = {}) {
    await getDriverUser(userId);

    const trip = await Trip.findOne({
      _id: tripId,
      driverId: userId,
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
      throw { status: 409, message: "You already reviewed this trip" };
    }

    const rating = await Rating.create({
      tripId,
      fromUserId: userId,
      toUserId: trip.riderId,
      stars: payload.stars,
      comment: payload.comment || "",
    });

    const riderRatingSummary = await syncUserRatingSummary(trip.riderId);

    return {
      message: "Rider review submitted successfully",
      rating,
      riderRatingSummary,
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

    trip.pricing.finalFare = calculateFareFromMetrics({
      distanceMiles: trip.distanceMiles,
      durationMinutes: trip.durationMinutes,
      baseFare: trip.pricing?.baseFare,
      pricePerMinute: trip.pricing?.pricePerMinute,
    });

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

    let autoCharge = buildAutoChargeResult();

    if (paymentIsRequired) {
      const riderProfile = await RiderProfile.findOne({ userId: trip.riderId });

      autoCharge = await attemptAutomaticTripCharge({
        trip,
        riderProfile,
        driverProfile: profile,
      });

      if (autoCharge.succeeded) {
        trip.paymentStatus = "paid";
        await trip.save();

        await syncPaymentRecord(trip, {
          stripeCustomerId: autoCharge.stripeCustomerId,
          stripePaymentIntentId: autoCharge.paymentIntentId,
          stripePaymentMethodId: autoCharge.paymentMethodId,
          status: "succeeded",
          paidAt: new Date(),
          failureMessage: null,
        });

        await creditDriverEarnings(userId, driverGets);
      } else if (autoCharge.attempted) {
        trip.paymentStatus = "failed";
        await trip.save();

        await syncPaymentRecord(trip, {
          stripeCustomerId: autoCharge.stripeCustomerId,
          stripePaymentIntentId: autoCharge.paymentIntentId,
          stripePaymentMethodId: autoCharge.paymentMethodId,
          status: "failed",
          paidAt: null,
          failureMessage: autoCharge.failureMessage,
        });
      } else {
        await syncPaymentRecord(trip, {
          stripeCustomerId: autoCharge.stripeCustomerId,
          stripePaymentMethodId: autoCharge.paymentMethodId,
          status: "pending",
          paidAt: null,
          failureMessage: autoCharge.failureMessage,
        });
      }
    }

    if (!paymentIsRequired) {
      await creditDriverEarnings(userId, driverGets);
    }

    return {
      message: !paymentIsRequired
        ? "Trip completed successfully"
        : autoCharge.succeeded
          ? "Trip completed and rider card charged successfully"
          : autoCharge.attempted
            ? "Trip completed, but automatic charge failed. Rider must complete payment manually."
            : "Trip completed, but rider has no saved card. Manual payment is required.",
      trip,
      paymentSummary: {
        totalFare,
        driverGets,
        platformGets,
        paymentStatus: trip.paymentStatus,
      },
      autoCharge,
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

    const [trip, payment, reviewGiven] = await Promise.all([
      Trip.findOne({
        _id: tripId,
        driverId: userId,
        status: { $in: ["completed", "cancelled"] },
      })
        .populate("riderId", "name profileImage ratingAvg ratingCount emergency")
        .populate("vehicleId", "brand model type size licensePlate")
        .lean(),
      Payment.findOne({ tripId, driverId: userId }).lean(),
      Rating.findOne({ tripId, fromUserId: userId }).lean(),
    ]);

    if (!trip) {
      throw { status: 404, message: "Trip summary not found" };
    }

    return {
      ...trip,
      rider: mapRiderSummary(trip.riderId),
      vehicle: mapVehicleSummary(trip.vehicleId),
      fare: buildTripFareSummary(trip),
      reviewGiven: mapReviewSummary(reviewGiven),
      payment: payment
        ? {
            _id: payment._id,
            status: payment.status,
            currency: payment.currency || null,
            totalFare: Number(payment.totalFare || 0),
            driverGets: Number(payment.driverGets || 0),
            platformGets: Number(payment.platformGets || 0),
            paidAt: payment.paidAt || null,
            failureMessage: payment.failureMessage || null,
          }
        : null,
    };
  },
};
