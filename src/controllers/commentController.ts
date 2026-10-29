import type { Response } from "express";
import sql from "../config/db.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import ErrorHandler from "../config/errorHandler.js";

// Kiểm tra user có quyền truy cập task thông qua project hay không
async function hasProjectAccess(taskId: string, userId: string) {
  const membership = await sql`
    SELECT 1
    FROM tasks t
    JOIN project_members pm
      ON pm.project_id = t.project_id
    WHERE t.task_id = ${taskId}
      AND pm.user_id = ${userId}
    LIMIT 1
  `;

  return membership.length > 0;
}

// 1. Lấy danh sách comment của task
export const getTaskComments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;

    if (typeof taskId !== "string") {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const hasAccess = await hasProjectAccess(taskId, userId);

    if (!hasAccess) {
      return res.status(404).json({
        message: "Task not found or you do not have access",
      });
    }

    const comments = await sql`
      SELECT
        c.comment_id,
        c.task_id,
        c.user_id,
        c.content,
        c.created_at,
        c.updated_at,
        u.name AS user_name,
        u.avatar_url AS user_avatar_url
      FROM comments c
      JOIN users u
        ON u.user_id = c.user_id
      WHERE c.task_id = ${taskId}
      ORDER BY c.created_at ASC
    `;

    return res.status(200).json({
      message: "Get task comments successfully",
      comments,
    });
  } catch (error) {
    console.error("Get task comments error:", error);

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

// 2. Tạo comment
export const createComment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (typeof taskId !== "string") {
      return res.status(400).json({
        message: "Invalid task ID",
      });
    }

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        message: "Comment content is required",
      });
    }

    const hasAccess = await hasProjectAccess(taskId, userId);

    if (!hasAccess) {
      return res.status(404).json({
        message: "Task not found or you do not have access",
      });
    }

    const comments = await sql`
      INSERT INTO comments (task_id, user_id, content)
      VALUES (${taskId}, ${userId}, ${content.trim()})
      RETURNING
        comment_id,
        task_id,
        user_id,
        content,
        created_at,
        updated_at
    `;

    const [comment] = comments;

    return res.status(201).json({
      message: "Comment created successfully",
      comment,
    });
  } catch (error) {
    console.error("Create comment error:", error);

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

// 3. Sửa comment — chỉ người viết comment
export const updateComment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { commentId } = req.params;
    const { content } = req.body;

    if (typeof commentId !== "string") {
      return res.status(400).json({
        message: "Invalid comment ID",
      });
    }

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        message: "Comment content is required",
      });
    }

    // Kiểm tra comment tồn tại và user có quyền truy cập project
    const accessibleComments = await sql`
      SELECT c.comment_id, c.user_id
      FROM comments c
      JOIN tasks t
        ON t.task_id = c.task_id
      JOIN project_members pm
        ON pm.project_id = t.project_id
      WHERE c.comment_id = ${commentId}
        AND pm.user_id = ${userId}
      LIMIT 1
    `;

    if (accessibleComments.length === 0) {
      return res.status(404).json({
        message: "Comment not found or you do not have access",
      });
    }

    if (accessibleComments[0].user_id !== userId) {
      return res.status(403).json({
        message: "Only the comment author can edit this comment",
      });
    }

    const updatedComments = await sql`
      UPDATE comments
      SET
        content = ${content.trim()},
        updated_at = NOW()
      WHERE comment_id = ${commentId}
        AND user_id = ${userId}
      RETURNING
        comment_id,
        task_id,
        user_id,
        content,
        created_at,
        updated_at
    `;

    return res.status(200).json({
      message: "Comment updated successfully",
      comment: updatedComments[0],
    });
  } catch (error) {
    console.error("Update comment error:", error);

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

// 4. Xóa comment — chỉ người viết comment
export const deleteComment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { commentId } = req.params;

    if (typeof commentId !== "string") {
      return res.status(400).json({
        message: "Invalid comment ID",
      });
    }

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const accessibleComments = await sql`
      SELECT c.comment_id, c.user_id
      FROM comments c
      JOIN tasks t
        ON t.task_id = c.task_id
      JOIN project_members pm
        ON pm.project_id = t.project_id
      WHERE c.comment_id = ${commentId}
        AND pm.user_id = ${userId}
      LIMIT 1
    `;

    if (accessibleComments.length === 0) {
      return res.status(404).json({
        message: "Comment not found or you do not have access",
      });
    }

    if (accessibleComments[0].user_id !== userId) {
      return res.status(403).json({
        message: "Only the comment author can delete this comment",
      });
    }

    await sql`
      DELETE FROM comments
      WHERE comment_id = ${commentId}
        AND user_id = ${userId}
    `;

    return res.status(200).json({
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Delete comment error:", error);

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
