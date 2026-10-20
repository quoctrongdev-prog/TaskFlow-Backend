import { Router } from "express";
import {
  createTask,
  getTasks,
  getTaskDetail,
  updateTask,
  updateTaskStatus,
  deleteTask,
} from "../controllers/tasksController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/projects/:projectId/tasks", authMiddleware, createTask);
router.get("/projects/:projectId/tasks", authMiddleware, getTasks);

router.get("/:taskId", authMiddleware, getTaskDetail);
router.patch("/:taskId", authMiddleware, updateTask);
router.patch("/:taskId/status", authMiddleware, updateTaskStatus);
router.delete("/:taskId", authMiddleware, deleteTask);

export default router;
