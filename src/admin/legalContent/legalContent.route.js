import express from "express";
import { legalContentController } from "./legalContent.controller.js";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";

const legalContentRouter = express.Router();
const allowOnlyPublicMount = (req, res, next) => {
  if (req.baseUrl === "/legal-content") {
    return next();
  }

  return next("route");
};

legalContentRouter.get("/public/:type", legalContentController.getContentByType);
legalContentRouter.get("/public/:type/:contentId", legalContentController.getContentById);
legalContentRouter.get("/:type", allowOnlyPublicMount, legalContentController.getContentByType);
legalContentRouter.get(
  "/:type/:contentId",
  allowOnlyPublicMount,
  legalContentController.getContentById
);

legalContentRouter.use(requireAuth);

legalContentRouter.get("/", legalContentController.getAllContent);
legalContentRouter.post("/:type", legalContentController.createContent);
legalContentRouter.get("/:type", legalContentController.getAdminContentByType);
legalContentRouter.get("/:type/:contentId", legalContentController.getAdminContentById);
legalContentRouter.patch("/:type/:contentId", legalContentController.updateContent);
legalContentRouter.delete("/:type/:contentId", legalContentController.deleteContent);

export default legalContentRouter;
