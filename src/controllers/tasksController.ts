import type { Response } from "express";
import sql from "../config/db.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";

const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
const STATUSES = [
  "Todo",
  "In_Progress",
  "Review",
  "Done",
  "Cancelled",
] as const;

// 1. Tạo task
export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;
    const {
      title,
      description,
      priority = "Medium",
      status = "Todo",
      assignee_id = null,
      due_date = null,
    } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: "Invalid priority" });
    }

    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Người tạo phải là thành viên của project
    // 1 là một giá trị cố định mà SQL trả về cho mỗi dòng tìm được
    // chỉ cần biết user có thuộc project hay không
    // Vì vậy, SELECT 1 giúp thể hiện đúng mục đích của truy vấn: chỉ kiểm tra sự tồn tại.
    // LIMIT 1 yêu cầu PostgreSQL trả về tối đa một dòng.
    // Dù tìm thấy một hay nhiều dòng phù hợp, truy vấn cũng không trả
    // về quá một dòng. Điều này phù hợp vì chỉ cần biết có thành viên hay không.
    // Nói chung là chỉ cần tìm xem có tồn tại trong project này không
    // Vì chỉ member trong prj đó mới được tạo task trong project đó
    const membership = await sql`
      SELECT 1
      FROM project_members
      WHERE project_id = ${projectId}
        AND user_id = ${userId}
      LIMIT 1
    `;

    if (membership.length === 0) {
      return res.status(403).json({
        message: "You are not a member of this project",
      });
    }

    // Người được giao task cũng phải là thành viên project
    if (assignee_id) {
      const assignee = await sql`
        SELECT 1
        FROM project_members
        WHERE project_id = ${projectId}
          AND user_id = ${assignee_id}
        LIMIT 1
      `;

      if (assignee.length === 0) {
        return res.status(400).json({
          message: "Assignee must be a project member",
        });
      }
    }

    const tasks = await sql`
      INSERT INTO tasks (
        project_id,
        title,
        description,
        priority,
        status,
        assignee_id,
        created_by,
        due_date
      )
      VALUES (
        ${projectId},
        ${title.trim()},
        ${description ?? null},
        ${priority},
        ${status},
        ${assignee_id},
        ${userId},
        ${due_date}
      )
      RETURNING *
    `;

    return res.status(201).json({
      message: "Task created successfully",
      task: tasks[0],
    });
  } catch (error) {
    console.error("Create task error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// 2. Lấy danh sách task trong project
export const getTasks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const membership = await sql`
      SELECT 1
      FROM project_members
      WHERE project_id = ${projectId}
        AND user_id = ${userId}
      LIMIT 1
    `;

    if (membership.length === 0) {
      return res.status(403).json({
        message: "You are not a member of this project",
      });
    }

    //t, assignee, creator đều là bí danh
    //t thì là bảng tasks, 2 cái kia là bảng users và . đến name
    //để hiển thị tên người dùng
    //AS ở đây chỉ đổi tên cột trong kết quả trả về
    //không đổi tên cột thật trong database.
    //LEFT JOIN users: ghép dữ liệu từ bảng users
    //nhưng giữ lại các dòng của tasks dù có khớp hay không.
    const tasks = await sql`
      SELECT
        t.*,
        assignee.name AS assignee_name,
        creator.name AS creator_name
      FROM tasks t
      LEFT JOIN users assignee
        ON assignee.user_id = t.assignee_id
      JOIN users creator
        ON creator.user_id = t.created_by
      WHERE t.project_id = ${projectId}
      ORDER BY t.created_at DESC
    `;

    return res.status(200).json({
      tasks,
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// 3. Lấy chi tiết task
export const getTaskDetail = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    //Chi tiết tasks của user này trong prj này
    const tasks = await sql`
      SELECT t.*
      FROM tasks t
      JOIN project_members pm
        ON pm.project_id = t.project_id
      WHERE t.task_id = ${taskId}
        AND pm.user_id = ${userId}
      LIMIT 1
    `;

    if (tasks.length === 0) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    return res.status(200).json({
      task: tasks[0],
    });
  } catch (error) {
    console.error("Get task detail error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// 4. Sửa task — chỉ người tạo task
export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;
    const { title, description, priority, status, assignee_id, due_date } =
      req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Kiểm tra quyền sở hữu task
    const existing = await sql`
      SELECT task_id, project_id
      FROM tasks
      WHERE task_id = ${taskId}
        AND created_by = ${userId}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return res.status(403).json({
        message: "Only the task creator can edit this task",
      });
    }

    //FE có gửi title thì toán tử && sẽ kiểm tra tiếp điều kiện sau
    //Nếu user có cập nhật thì cập nhật title tiếp
    //còn không thì bỏ qua giữ nguyên như cũ
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return res.status(400).json({
        message: "Title cannot be empty",
      });
    }

    if (priority !== undefined && !PRIORITIES.includes(priority)) {
      return res.status(400).json({
        message: "Invalid priority",
      });
    }

    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    // Nếu có assignee mới, kiểm tra họ thuộc project
    //existing[0].project_id: lấy ra ID của project mà task này thuộc về.
    if (assignee_id !== undefined && assignee_id !== null) {
      const assignee = await sql`
        SELECT 1
        FROM project_members
        WHERE project_id = ${existing[0].project_id}
          AND user_id = ${assignee_id}
        LIMIT 1
      `;

      if (assignee.length === 0) {
        return res.status(400).json({
          message: "Assignee must be a project member",
        });
      }
    }

    const trimmedTitle = title === undefined ? null : title.trim();

    const updated = await sql`
      UPDATE tasks
      SET
        title = CASE
          WHEN ${title !== undefined}
          THEN ${trimmedTitle}
          ELSE title
        END,
        description = CASE
          WHEN ${description !== undefined}
          THEN ${description}
          ELSE description
        END,
        priority = CASE
          WHEN ${priority !== undefined}
          THEN ${priority}
          ELSE priority
        END,
        status = CASE
          WHEN ${status !== undefined}
          THEN ${status}
          ELSE status
        END,
        assignee_id = CASE
          WHEN ${assignee_id !== undefined}
          THEN ${assignee_id}
          ELSE assignee_id
        END,
        due_date = CASE
          WHEN ${due_date !== undefined}
          THEN ${due_date}
          ELSE due_date
        END,
        updated_at = NOW()
      WHERE task_id = ${taskId}
        AND created_by = ${userId}
      RETURNING *
    `;

    if (updated.length === 0) {
      return res.status(404).json({
        message: "Task not found or no longer available",
      });
    }

    return res.status(200).json({
      message: "Task updated successfully",
      task: updated[0],
    });
  } catch (error) {
    console.error("Update task error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// 5. Đổi trạng thái task — cũng chỉ người tạo
export const updateTaskStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;
    const { status } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const tasks = await sql`
      UPDATE tasks
      SET
        status = ${status},
        updated_at = NOW()
      WHERE task_id = ${taskId}
        AND created_by = ${userId}
      RETURNING *
    `;

    if (tasks.length === 0) {
      return res.status(403).json({
        message: "Only the task creator can change its status",
      });
    }

    return res.status(200).json({
      message: "Task status updated successfully",
      task: tasks[0],
    });
  } catch (error) {
    console.error("Update task status error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// 6. Xóa task — chỉ người tạo task
export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const deleted = await sql`
      DELETE FROM tasks
      WHERE task_id = ${taskId}
        AND created_by = ${userId}
      RETURNING task_id
    `;

    if (deleted.length === 0) {
      return res.status(403).json({
        message: "Only the task creator can delete this task",
      });
    }

    return res.status(200).json({
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Delete task error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
