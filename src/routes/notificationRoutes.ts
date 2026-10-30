import { Router } from "express";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../controllers/notificationController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authMiddleware, getNotifications);
router.get("/unread-count", authMiddleware, getUnreadCount);

router.patch("/read-all", authMiddleware, markAllAsRead);
router.patch("/:notificationId/read", authMiddleware, markAsRead);

router.delete("/:notificationId", authMiddleware, deleteNotification);

export default router;
