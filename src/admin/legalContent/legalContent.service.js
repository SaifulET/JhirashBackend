import { LegalContent } from "../../models/Legal_content/Legal_content.model.js";
import { User } from "../../models/User/User.model.js";

const normalizeType = (value = "") => {
  const normalized = String(value).trim().toLowerCase().replace(/[_\s]+/g, "-");

  if (normalized === "terms" || normalized === "terms-and-condition") {
    return "terms-and-conditions";
  }

  if (normalized === "privacy" || normalized === "privacy-policy") {
    return "privacy-policy";
  }

  return normalized;
};

const stripHtml = (html = "") =>
  String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const assertSupportedType = (type) => {
  const normalizedType = normalizeType(type);

  if (!["terms-and-conditions", "privacy-policy"].includes(normalizedType)) {
    throw {
      status: 400,
      message: "type must be either terms-and-conditions or privacy-policy",
    };
  }

  return normalizedType;
};

const mapLegalContent = (doc) => {
  if (!doc) {
    return null;
  }

  return {
    _id: doc._id,
    type: doc.type,
    title: doc.title,
    contentHtml: doc.contentHtml,
    contentDelta: doc.contentDelta || null,
    plainText: doc.plainText || "",
    isPublished: Boolean(doc.isPublished),
    createdBy: doc.createdBy || null,
    updatedBy: doc.updatedBy || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const getAdminUser = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (user.role !== "admin") {
    throw { status: 403, message: "Only admin can manage legal content" };
  }

  return user;
};

export const legalContentService = {
  async createContent(userId, payload = {}) {
    await getAdminUser(userId);

    const type = assertSupportedType(payload.type);
    const contentHtml = String(payload.contentHtml || "").trim();
    const plainText = stripHtml(payload.plainText || contentHtml);

    if (!payload.title?.trim()) {
      throw { status: 400, message: "title is required" };
    }

    if (!contentHtml) {
      throw { status: 400, message: "contentHtml is required" };
    }

    const existing = await LegalContent.findOne({ type }).lean();
    if (existing) {
      throw { status: 409, message: `${type} already exists` };
    }

    const content = await LegalContent.create({
      type,
      title: payload.title.trim(),
      contentHtml,
      contentDelta: payload.contentDelta ?? null,
      plainText,
      isPublished: payload.isPublished !== undefined ? Boolean(payload.isPublished) : true,
      createdBy: userId,
      updatedBy: userId,
    });

    return mapLegalContent(content);
  },

  async getAllContent(userId) {
    await getAdminUser(userId);

    const contents = await LegalContent.find().sort({ createdAt: 1 }).lean();
    return {
      items: contents.map(mapLegalContent),
    };
  },

  async getContentByType(type) {
    const normalizedType = assertSupportedType(type);

    const content = await LegalContent.findOne({ type: normalizedType }).lean();
    if (!content) {
      throw { status: 404, message: "Legal content not found" };
    }

    return mapLegalContent(content);
  },

  async updateContent(userId, type, payload = {}) {
    await getAdminUser(userId);

    const normalizedType = assertSupportedType(type);
    const update = {
      updatedBy: userId,
    };

    if (payload.title !== undefined) {
      if (!String(payload.title || "").trim()) {
        throw { status: 400, message: "title cannot be empty" };
      }

      update.title = String(payload.title).trim();
    }

    if (payload.contentHtml !== undefined) {
      const contentHtml = String(payload.contentHtml || "").trim();
      if (!contentHtml) {
        throw { status: 400, message: "contentHtml cannot be empty" };
      }

      update.contentHtml = contentHtml;
      update.plainText = stripHtml(payload.plainText || contentHtml);
    } else if (payload.plainText !== undefined) {
      update.plainText = stripHtml(payload.plainText);
    }

    if (payload.contentDelta !== undefined) {
      update.contentDelta = payload.contentDelta;
    }

    if (payload.isPublished !== undefined) {
      update.isPublished = Boolean(payload.isPublished);
    }

    const content = await LegalContent.findOneAndUpdate(
      { type: normalizedType },
      { $set: update },
      { new: true }
    ).lean();

    if (!content) {
      throw { status: 404, message: "Legal content not found" };
    }

    return mapLegalContent(content);
  },

  async deleteContent(userId, type) {
    await getAdminUser(userId);

    const normalizedType = assertSupportedType(type);
    const content = await LegalContent.findOneAndDelete({ type: normalizedType }).lean();

    if (!content) {
      throw { status: 404, message: "Legal content not found" };
    }

    return {
      message: "Legal content deleted successfully",
      deleted: mapLegalContent(content),
    };
  },
};
