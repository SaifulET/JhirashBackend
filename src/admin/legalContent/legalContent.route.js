import express from "express";
import { legalContentController } from "./legalContent.controller.js";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";

const legalContentRouter = express.Router();

legalContentRouter.get("/:type", legalContentController.getContentByType);

legalContentRouter.use(requireAuth);

legalContentRouter.get("/", legalContentController.getAllContent);
legalContentRouter.post("/", legalContentController.createContent);
legalContentRouter.patch("/:type", legalContentController.updateContent);
legalContentRouter.delete("/:type", legalContentController.deleteContent);

export default legalContentRouter;
