import { User } from "../../models/User/User.model.js";
import { Payment } from "../../models/Payment/Payment.model.js";
import { Trip } from "../../models/Trip/Trip.model.js";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ensureAdminUser = async (userId) => {
  const user = await User.findById(userId).select("_id role isDeleted").lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "Admin user not found" };
  }

  if (user.role !== "admin") {
    throw { status: 403, message: "Only admin can access this resource" };
  }

  return user;
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toCurrencyNumber = (value) => Number(toNumber(value).toFixed(2));

const parseYear = (value) => {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw { status: 400, message: "year must be a valid number between 2000 and 2100" };
  }
  return year;
};

const parseMonth = (value) => {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw { status: 400, message: "month must be a valid number between 1 and 12" };
  }
  return month;
};

const getUtcMonthBounds = (year, month) => ({
  start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
  end: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
});

const getUtcYearBounds = (year) => ({
  start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
  end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
});

const getTripTier = (trip) => {
  const tier = String(trip?.rideOption?.tier || "").trim().toLowerCase();
  return tier === "premium" ? "premium" : "regular";
};

const buildUserOverview = async (yearBounds, year) => {
  const [yearUsers, totalRidersOverall, totalDriversOverall] = await Promise.all([
    User.find({
      role: { $in: ["rider", "driver"] },
      createdAt: { $gte: yearBounds.start, $lt: yearBounds.end },
      isDeleted: { $ne: true },
    })
      .select("role createdAt")
      .lean(),
    User.countDocuments({ role: "rider", isDeleted: { $ne: true } }),
    User.countDocuments({ role: "driver", isDeleted: { $ne: true } }),
  ]);

  const riderSeries = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: MONTH_LABELS[index],
    count: 0,
  }));
  const driverSeries = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: MONTH_LABELS[index],
    count: 0,
  }));

  for (const user of yearUsers) {
    const monthIndex = new Date(user.createdAt).getUTCMonth();
    if (user.role === "rider") {
      riderSeries[monthIndex].count += 1;
    }
    if (user.role === "driver") {
      driverSeries[monthIndex].count += 1;
    }
  }

  const totalRidersInYear = riderSeries.reduce((sum, item) => sum + item.count, 0);
  const totalDriversInYear = driverSeries.reduce((sum, item) => sum + item.count, 0);

  return {
    year,
    chart: MONTH_LABELS.map((label, index) => ({
      month: index + 1,
      label,
      rider: riderSeries[index].count,
      driver: driverSeries[index].count,
    })),
    totals: {
      rider: totalRidersInYear,
      driver: totalDriversInYear,
    },
    overall: {
      rider: totalRidersOverall,
      driver: totalDriversOverall,
    },
  };
};

export const dashboardService = {
  async getOverview(adminUserId, query = {}) {
    await ensureAdminUser(adminUserId);

    const now = new Date();
    const year = query.year !== undefined ? parseYear(query.year) : now.getUTCFullYear();
    const month = query.month !== undefined ? parseMonth(query.month) : now.getUTCMonth() + 1;

    const monthBounds = getUtcMonthBounds(year, month);
    const yearBounds = getUtcYearBounds(year);

    const [monthlyPayments, userOverview] = await Promise.all([
      Payment.find({
        status: "succeeded",
        $or: [
          {
            paidAt: { $gte: monthBounds.start, $lt: monthBounds.end },
          },
          {
            paidAt: null,
            createdAt: { $gte: monthBounds.start, $lt: monthBounds.end },
          },
        ],
      })
        .populate("tripId", "rideOption")
        .lean(),
      buildUserOverview(yearBounds, year),
    ]);

    let regularVehiclesIncome = 0;
    let premiumVehiclesIncome = 0;

    for (const payment of monthlyPayments) {
      const amount = toCurrencyNumber(payment.platformGets || 0);
      const tier = getTripTier(payment.tripId);

      if (tier === "premium") {
        premiumVehiclesIncome += amount;
      } else {
        regularVehiclesIncome += amount;
      }
    }

    return {
      filters: {
        month,
        year,
      },
      monthlyBreakdown: {
        currency: "USD",
        regularVehiclesIncome: toCurrencyNumber(regularVehiclesIncome),
        premiumVehiclesIncome: toCurrencyNumber(premiumVehiclesIncome),
        totalIncome: toCurrencyNumber(regularVehiclesIncome + premiumVehiclesIncome),
      },
      userOverview,
    };
  },

  async getAnalytics(adminUserId, query = {}) {
    await ensureAdminUser(adminUserId);

    const now = new Date();
    const year = query.year !== undefined ? parseYear(query.year) : now.getUTCFullYear();
    const yearBounds = getUtcYearBounds(year);

    const [payments, userOverview] = await Promise.all([
      Payment.find({
        status: "succeeded",
        $or: [
          {
            paidAt: { $gte: yearBounds.start, $lt: yearBounds.end },
          },
          {
            paidAt: null,
            createdAt: { $gte: yearBounds.start, $lt: yearBounds.end },
          },
        ],
      }).lean(),
      buildUserOverview(yearBounds, year),
    ]);

    const revenueSeries = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      label: MONTH_LABELS[index],
      amount: 0,
    }));

    for (const payment of payments) {
      const sourceDate = payment.paidAt || payment.createdAt;
      const monthIndex = new Date(sourceDate).getUTCMonth();
      revenueSeries[monthIndex].amount += toCurrencyNumber(payment.platformGets || 0);
    }

    return {
      filters: {
        year,
      },
      revenueMetrics: {
        currency: "USD",
        chart: revenueSeries.map((item) => ({
          month: item.month,
          label: item.label,
          amount: toCurrencyNumber(item.amount),
        })),
        totalRevenue: toCurrencyNumber(
          revenueSeries.reduce((sum, item) => sum + item.amount, 0)
        ),
      },
      userMetrics: userOverview,
    };
  },
};
