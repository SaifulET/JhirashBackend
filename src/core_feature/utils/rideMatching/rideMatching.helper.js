import { DriverProfile } from "../../../models/Driver_profile/Driver_profile.model.js";

export const TWO_MILES_IN_METERS = 3219;
export const TEN_KILOMETERS_IN_METERS = 10000;
export const TEN_KILOMETERS_IN_MILES = Number(
  (TEN_KILOMETERS_IN_METERS / 1609.344).toFixed(2)
);

export const buildNearbyPointQuery = ({
  lng,
  lat,
  maxDistance = TEN_KILOMETERS_IN_METERS,
}) => ({
  $near: {
    $geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    $maxDistance: maxDistance,
  },
});

export const findNearbyAvailableDrivers = async ({
  lng,
  lat,
  maxDistance = TEN_KILOMETERS_IN_METERS,
  populate = false,
  lean = true,
} = {}) => {
  let query = DriverProfile.find({
    status: "active",
    isOnline: true,
    isBusy: false,
    activeVehicleId: { $ne: null },
    "location.point": buildNearbyPointQuery({ lng, lat, maxDistance }),
  });

  if (populate) {
    query = query
      .populate("userId", "name profileImage ratingAvg ratingCount")
      .populate("activeVehicleId", "brand model type size licensePlate");
  }

  if (lean) {
    query = query.lean();
  }

  return await query;
};
