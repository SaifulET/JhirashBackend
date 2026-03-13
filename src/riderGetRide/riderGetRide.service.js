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

    return {
      rideRequest,
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
