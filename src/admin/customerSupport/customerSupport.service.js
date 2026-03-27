import { User } from "../../models/User/User.model.js";
import { Report } from "../../models/Reports/Reports.model.js";
import { SupportTicket } from "../../models/Support_tickets/Support_tickets.model.js";
import { Notification } from "../../models/Notifications/Notifications.model.js";
import { Trip } from "../../models/Trip/Trip.model.js";

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

const mapUserSummary = (user) =>
  user
    ? {
        _id: user._id,
        name: user.name,
        role: user.role || null,
        email: user.email || null,
        phone: user.phone || null,
        profileImage: user.profileImage || null,
        ratingAvg: Number(user.ratingAvg || 0),
        ratingCount: Number(user.ratingCount || 0),
        accusedCount: Number(user.accusedCount || 0),
        status: user.status || "active",
      }
    : null;

const mapTicketStatus = (status) => status || "pending";

const mapReportStatus = (status) => status || "pending";

const mapTicketListItem = ({ index, ticket }) => ({
  no: index + 1,
  _id: ticket._id,
  entryType: "ticket",
  reportingParty: mapUserSummary(ticket.createdBy),
  reportingPartyName: ticket.createdBy?.name || null,
  userType: ticket.createdBy?.role || null,
  email: ticket.createdBy?.email || null,
  contact: ticket.createdBy?.phone || null,
  status: mapTicketStatus(ticket.status),
  complaint: ticket.againstUserId ? "yes" : "no",
  title: ticket.title,
  message: ticket.message,
  tripId: ticket.tripId?._id || ticket.tripId || null,
  againstUserId: ticket.againstUserId?._id || ticket.againstUserId || null,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});

const mapReportListItem = ({ index, report }) => ({
  no: index + 1,
  _id: report._id,
  entryType: "report",
  reportingParty: mapUserSummary(report.reporterId),
  reportingPartyName: report.reporterId?.name || null,
  userType: report.reporterId?.role || null,
  email: report.reporterId?.email || null,
  contact: report.reporterId?.phone || null,
  status: mapReportStatus(report.status),
  complaint: "yes",
  title: "Complaint",
  message: report.message,
  tripId: report.tripId?._id || report.tripId || null,
  againstUserId: report.reportedUserId?._id || report.reportedUserId || null,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
});

const matchesComplaintFilter = (item, complaint) => {
  if (!complaint) {
    return true;
  }

  const value = String(complaint).trim().toLowerCase();
  if (!["yes", "no"].includes(value)) {
    return true;
  }

  return item.complaint === value;
};

const matchesStatusFilter = (item, status) => {
  if (!status) {
    return true;
  }

  return item.status === String(status).trim().toLowerCase();
};

const matchesUserTypeFilter = (item, userType) => {
  if (!userType) {
    return true;
  }

  return item.userType === String(userType).trim().toLowerCase();
};

const matchesSearchFilter = (item, search) => {
  const normalizedSearch = String(search || "").trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    item.reportingPartyName,
    item.email,
    item.contact,
    item.title,
    item.message,
  ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
};

const buildTicketAdminAction = (ticket) =>
  ticket?.adminAction
    ? {
        actionType: ticket.adminAction.actionType || null,
        messageSent: ticket.adminAction.messageSent || null,
        adminId: ticket.adminAction.adminId || null,
        at: ticket.adminAction.at || null,
      }
    : null;

const buildReportAdminAction = (report) =>
  report?.resolvedBy || report?.resolvedAt || report?.resolutionNote
    ? {
        actionType: report.status === "resolved" ? "mark_resolved" : "send_message",
        messageSent: report.resolutionNote || null,
        adminId: report.resolvedBy || null,
        at: report.resolvedAt || null,
      }
    : null;

const mapTicketDetail = ({ ticket, reportingParty, againstUser, trip }) => ({
  _id: ticket._id,
  entryType: "ticket",
  status: mapTicketStatus(ticket.status),
  complaint: Boolean(ticket.againstUserId),
  title: ticket.title,
  message: ticket.message,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
  trip: trip
    ? {
        _id: trip._id,
        status: trip.status,
        paymentStatus: trip.paymentStatus || null,
        createdAt: trip.createdAt,
      }
    : null,
  reportingParty: mapUserSummary(reportingParty),
  reportedParty: mapUserSummary(againstUser),
  adminAction: buildTicketAdminAction(ticket),
});

const mapReportDetail = ({ report, reporter, reportedUser, trip }) => ({
  _id: report._id,
  entryType: "report",
  status: mapReportStatus(report.status),
  complaint: true,
  title: "Complaint",
  message: report.message,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  trip: trip
    ? {
        _id: trip._id,
        status: trip.status,
        paymentStatus: trip.paymentStatus || null,
        createdAt: trip.createdAt,
      }
    : null,
  reportingParty: mapUserSummary(reporter),
  reportedParty: mapUserSummary(reportedUser),
  adminAction: buildReportAdminAction(report),
});

const sendAdminMessageNotification = async ({ userId, title, body, data }) => {
  if (!userId || !body) {
    return null;
  }

  return Notification.create({
    userId,
    type: "admin_support_message",
    title: title || "Message from support",
    body,
    data,
  });
};

const findSupportEntryById = async (entryId) => {
  const ticket = await SupportTicket.findById(entryId).lean();
  if (ticket) {
    return { entryType: "ticket", item: ticket };
  }

  const report = await Report.findById(entryId).lean();
  if (report) {
    return { entryType: "report", item: report };
  }

  throw { status: 404, message: "Customer support item not found" };
};

export const customerSupportService = {
  async listItems(adminUserId, query = {}) {
    await ensureAdminUser(adminUserId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const complaint = query.complaint;
    const status = query.status;
    const userType = query.userType;
    const search = query.search;

    const [tickets, reports] = await Promise.all([
      SupportTicket.find()
        .sort({ createdAt: -1 })
        .populate("createdBy", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .populate("againstUserId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .populate("tripId", "status paymentStatus createdAt")
        .lean(),
      Report.find()
        .sort({ createdAt: -1 })
        .populate("reporterId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .populate("reportedUserId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .populate("tripId", "status paymentStatus createdAt")
        .lean(),
    ]);

    const items = [
      ...tickets.map((ticket, index) => mapTicketListItem({ index, ticket })),
      ...reports.map((report, index) => mapReportListItem({ index, report })),
    ]
      .filter((item) => matchesComplaintFilter(item, complaint))
      .filter((item) => matchesStatusFilter(item, status))
      .filter((item) => matchesUserTypeFilter(item, userType))
      .filter((item) => matchesSearchFilter(item, search))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = items.length;
    const skip = (page - 1) * limit;
    const paginatedItems = items.slice(skip, skip + limit).map((item, index) => ({
      ...item,
      no: skip + index + 1,
    }));

    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getItemDetail(adminUserId, entryId) {
    await ensureAdminUser(adminUserId);

    const { entryType, item } = await findSupportEntryById(entryId);

    if (entryType === "ticket") {
      const ticket = await SupportTicket.findById(item._id)
        .populate("createdBy", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .populate("againstUserId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .lean();

      const trip = ticket.tripId ? await Trip.findById(ticket.tripId).lean() : null;

      return {
        item: mapTicketDetail({
          ticket,
          reportingParty: ticket.createdBy,
          againstUser: ticket.againstUserId,
          trip,
        }),
      };
    }

    const report = await Report.findById(item._id)
      .populate("reporterId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
      .populate("reportedUserId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
      .lean();

    const trip = report.tripId ? await Trip.findById(report.tripId).lean() : null;

    return {
      item: mapReportDetail({
        report,
        reporter: report.reporterId,
        reportedUser: report.reportedUserId,
        trip,
      }),
    };
  },

  async takeAction(adminUserId, entryId, payload = {}) {
    await ensureAdminUser(adminUserId);

    const { entryType, item } = await findSupportEntryById(entryId);
    const actionType = String(payload.actionType || "").trim().toLowerCase();
    const message = String(payload.message || "").trim();
    const targetUserId = payload.targetUserId ? String(payload.targetUserId) : null;

    if (!["send_message", "mark_resolved"].includes(actionType)) {
      throw { status: 400, message: "actionType must be send_message or mark_resolved" };
    }

    if (actionType === "send_message" && !message) {
      throw { status: 400, message: "message is required when actionType is send_message" };
    }

    if (entryType === "ticket") {
      const ticket = item;

      const allowedTargetIds = [ticket.createdBy, ticket.againstUserId]
        .filter(Boolean)
        .map((value) => String(value));
      const resolvedTargetUserId = targetUserId || String(ticket.createdBy);

      if (!allowedTargetIds.includes(resolvedTargetUserId)) {
        throw { status: 400, message: "targetUserId is not related to this support ticket" };
      }

      if (actionType === "send_message") {
        await sendAdminMessageNotification({
          userId: resolvedTargetUserId,
          title: `Support reply: ${ticket.title}`,
          body: message,
          data: {
            entryType: "ticket",
            entryId: String(ticket._id),
          },
        });
      }

      const updatedTicket = await SupportTicket.findByIdAndUpdate(
        entryId,
        {
          $set: {
            status: actionType === "mark_resolved" ? "resolved" : "received",
            adminAction: {
              actionType,
              messageSent: message || null,
              adminId: adminUserId,
              at: new Date(),
            },
          },
        },
        { new: true }
      )
        .populate("createdBy", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .populate("againstUserId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
        .lean();

      return {
        message:
          actionType === "mark_resolved"
            ? "Support ticket marked as resolved successfully"
            : "Message sent successfully",
        item: mapTicketDetail({
          ticket: updatedTicket,
          reportingParty: updatedTicket.createdBy,
          againstUser: updatedTicket.againstUserId,
          trip: updatedTicket.tripId ? await Trip.findById(updatedTicket.tripId).lean() : null,
        }),
      };
    }

    const report = item;

    const allowedTargetIds = [report.reporterId, report.reportedUserId]
      .filter(Boolean)
      .map((value) => String(value));
    const resolvedTargetUserId = targetUserId || String(report.reporterId);

    if (!allowedTargetIds.includes(resolvedTargetUserId)) {
      throw { status: 400, message: "targetUserId is not related to this report" };
    }

    if (actionType === "send_message") {
      await sendAdminMessageNotification({
        userId: resolvedTargetUserId,
        title: "Support update on your report",
        body: message,
        data: {
          entryType: "report",
          entryId: String(report._id),
        },
      });
    }

    const updatedReport = await Report.findByIdAndUpdate(
      entryId,
      {
        $set: {
          status: actionType === "mark_resolved" ? "resolved" : "reviewed",
          resolutionNote: message || report.resolutionNote || null,
          resolvedBy: adminUserId,
          resolvedAt: new Date(),
        },
      },
      { new: true }
    )
      .populate("reporterId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
      .populate("reportedUserId", "name role email phone profileImage ratingAvg ratingCount accusedCount status")
      .lean();

    return {
      message:
        actionType === "mark_resolved"
          ? "Report marked as resolved successfully"
          : "Message sent successfully",
      item: mapReportDetail({
        report: updatedReport,
        reporter: updatedReport.reporterId,
        reportedUser: updatedReport.reportedUserId,
        trip: updatedReport.tripId ? await Trip.findById(updatedReport.tripId).lean() : null,
      }),
    };
  },

  async deleteItem(adminUserId, entryId) {
    await ensureAdminUser(adminUserId);

    const { entryType, item } = await findSupportEntryById(entryId);

    if (entryType === "ticket") {
      const deleted = await SupportTicket.findByIdAndDelete(item._id).lean();

      return {
        message: "Support ticket deleted successfully",
        deleted: {
          _id: deleted._id,
          entryType: "ticket",
        },
      };
    }

    const deleted = await Report.findByIdAndDelete(item._id).lean();

    return {
      message: "Report deleted successfully",
      deleted: {
        _id: deleted._id,
        entryType: "report",
      },
    };
  },
};
