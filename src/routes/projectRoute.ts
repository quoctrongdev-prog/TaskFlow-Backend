import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { acceptInvitation, sendInvitation } from "../controllers/invitationsController.js";
import { createProject, deleteProject, getProject, updateRole, updateProject,projectDetail, getProjectMembers, getProjectProgress } from "../controllers/projectController.js";

const router = express.Router();

router.post("/create-project", authMiddleware, createProject);
router.get("/get-projects", authMiddleware, getProject);
router.get("/:projectId/members",authMiddleware, getProjectMembers);
router.get("/:projectId", authMiddleware, projectDetail);
router.get("/:projectId/progress", authMiddleware, getProjectProgress);
router.patch("/update/:projectId", authMiddleware, updateProject);
router.patch("/update-role/:projectId/:userId", authMiddleware, updateRole);
router.delete("/delete/:projectId", authMiddleware, deleteProject);
router.post("/send-invitation/:projectId", authMiddleware, sendInvitation)
router.post("/accept-invitation/", authMiddleware, acceptInvitation)

export default router;
