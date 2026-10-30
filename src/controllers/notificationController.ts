import type { Response } from "express";
import sql from "../config/db.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import ErrorHandler from "../config/errorHandler.js";

// 1. Lấy danh sách notifications
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    //actor: ID của user thực hiện hành động gây ra notification
    //user_id: Người nhận thông báo
    //actor_user_id: Người thực hiện hành động
    const notifications = await sql`
      SELECT
        n.*,
        actor.name AS actor_name,
        actor.avatar_url AS actor_avatar_url
      FROM notifications n
      LEFT JOIN users actor
        ON actor.user_id = n.actor_user_id
      WHERE n.user_id = ${userId}
      ORDER BY n.created_at DESC
      LIMIT 50
    `;

    return res.status(200).json({
      message: "Notifications retrieved successfully",
      notifications,
    });
  } catch (error) {
    console.error("Get notifications error:", error);

    if (error instanceof ErrorHandler) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// 2. Lấy số lượng notifications chưa đọc
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await sql`
      SELECT COUNT(*)::int AS unread_count
      FROM notifications
      WHERE user_id = ${userId}
        AND is_read = FALSE
    `;

    return res.status(200).json({
      unread_count: result[0].unread_count,
    });
  } catch (error) {
    console.error("Get unread count error:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// 3. Đánh dấu một notification đã đọc
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { notificationId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (typeof notificationId !== "string") {
      return res.status(400).json({
        message: "Invalid notification ID",
      });
    }

    const notifications = await sql`
      UPDATE notifications
      SET is_read = TRUE
      WHERE notification_id = ${notificationId}
        AND user_id = ${userId}
      RETURNING *
    `;

    if (notifications.length === 0) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      notification: notifications[0],
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// 4. Đánh dấu tất cả notifications đã đọc
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await sql`
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = ${userId}
        AND is_read = FALSE
    `;

    return res.status(200).json({
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// 5. Xóa một notification
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { notificationId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (typeof notificationId !== "string") {
      return res.status(400).json({
        message: "Invalid notification ID",
      });
    }

    const deleted = await sql`
      DELETE FROM notifications
      WHERE notification_id = ${notificationId}
        AND user_id = ${userId}
      RETURNING notification_id
    `;

    if (deleted.length === 0) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Delete notification error:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
