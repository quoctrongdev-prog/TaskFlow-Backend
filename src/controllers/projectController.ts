import sql from "../config/db.js";
import ErrorHandler from "../config/errorHandler.js";
import dotenv from "dotenv";
import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";

export const createProject = async (req: AuthRequest, res: Response) => {
  try {
    //Lấy id user xem đã đăng nhập chưa
    const user = req.userId;
    if (!user) {
      throw new ErrorHandler(401, "Athentication required");
    }

    const { name, description, due_date } = req.body;
    const createdBy = user;

    if (
      due_date !== undefined &&
      due_date !== null &&
      due_date !== "" &&
      (typeof due_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(due_date) ||
        Number.isNaN(Date.parse(`${due_date}T00:00:00Z`)) ||
        new Date(`${due_date}T00:00:00Z`).toISOString().slice(0, 10) !==
          due_date)
    ) {
      throw new ErrorHandler(400, "Invalid due date");
    }

    const dueDate = due_date || null;

    if (typeof name !== "string" || name.trim() === "") {
      throw new ErrorHandler(400, "Name is required");
    }

    const existProject =
      await sql`SELECT project_id from projects WHERE name = ${name}`;

    if (existProject.length > 0) {
      throw new ErrorHandler(409, "Project with this name already exists");
    }

    await sql`BEGIN`;

    const project =
      await sql`INSERT INTO projects (name, description, due_date, created_by) VALUES
    (${name}, ${description}, ${dueDate}, ${createdBy}) RETURNING
    project_id, name, description, image_url, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, created_by, created_at`;

    const projectId = project[0].project_id;
    const role = "Admin";

    await sql`INSERT INTO project_members (project_id, user_id, role) VALUES
    (${projectId}, ${createdBy}, ${role})`;

    await sql`COMMIT`;

    res.json({
      message: "Create project successfully!",
      project: project[0],
    });
  } catch (error) {
    console.log(error);
    await sql`ROLLBACK`;

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

export const getProject = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      throw new ErrorHandler(401, "Authentication required");
    }

    const project = await sql`
      SELECT
        p.project_id,
        p.name,
        p.description,
        p.created_by,
        p.created_at,
        p.updated_at,
        p.image_url,
        TO_CHAR(p.due_date, 'YYYY-MM-DD') AS due_date,
        u.name AS created_by_name,
        u.avatar_url AS created_by_avatar_url,
        CASE
          WHEN p.created_by = ${userId} THEN 'Admin'
          ELSE pm.role
        END AS member_role
      FROM projects AS p
      INNER JOIN users AS u
        ON u.user_id = p.created_by
      LEFT JOIN project_members AS pm
        ON pm.project_id = p.project_id
        AND pm.user_id = ${userId}
      WHERE
        p.created_by = ${userId}
        OR pm.user_id = ${userId}
      ORDER BY p.updated_at DESC;
    `;

    return res.status(200).json({
      message:
        project.length === 0
          ? "You haven't joined any projects yet"
          : "Get projects successfully",
      project,
    });
  } catch (error) {
    console.error("Get projects error:", error);

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

export const getProjectMembers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;

    if (!userId) {
      throw new ErrorHandler(401, "Authentication required");
    }

    // Chỉ thành viên của project mới được xem danh sách
    const [membership] = await sql`
      SELECT 1
      FROM project_members
      WHERE project_id = ${projectId}
        AND user_id = ${userId}
      LIMIT 1
    `;

    if (!membership) {
      throw new ErrorHandler(404, "Project not found or you don't have access");
    }

    const members = await sql`
      SELECT
        u.user_id,
        u.name,
        u.email,
        u.avatar_url,
        pm.role
      FROM project_members AS pm
      INNER JOIN users AS u
        ON u.user_id = pm.user_id
      WHERE pm.project_id = ${projectId}
      ORDER BY u.name ASC
    `;

    return res.status(200).json({
      message: "Get project members successfully",
      count: members.length,
      members,
    });
  } catch (error) {
    console.error("Get project members error:", error);

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

export const projectDetail = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.userId;
    const projectId = req.params.projectId;

    if (!user) {
      throw new ErrorHandler(401, "Athentication required");
    }

    const projectDetail = await sql`SELECT
    w.project_id,
    w.name,
    w.description,
    w.created_by,
    w.created_at,
    w.updated_at,
    m.role
    FROM projects AS w
    INNER JOIN project_members AS m
    ON w.project_id = m.project_id
    WHERE m.user_id = ${user} AND w.project_id = ${projectId}`;

    if (projectDetail.length === 0) {
      throw new ErrorHandler(404, "project not found or you don't have access");
    }

    res.status(200).json({
      message: "Get project detail successfully",
      projectDetail: projectDetail[0],
    });
  } catch (error) {
    console.error("Get project detail error:", error);

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

export const getProjectProgress = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { projectId } = req.params;

    if (!userId) {
      throw new ErrorHandler(401, "Authentication required");
    }

    const result = await sql`
      SELECT
        COUNT(t.task_id)::int AS total_tasks,

        COUNT(t.task_id) FILTER (
          WHERE t.status = 'Done'
        )::int AS completed_tasks,

        COALESCE(
          ROUND(
            COUNT(t.task_id) FILTER (
              WHERE t.status = 'Done'
            ) * 100.0
            / NULLIF(COUNT(t.task_id), 0)
          ),
          0
        )::int AS progress

      FROM projects p

      LEFT JOIN project_members pm
        ON pm.project_id = p.project_id
        AND pm.user_id = ${userId}

      LEFT JOIN tasks t
        ON t.project_id = p.project_id

      WHERE
        p.project_id = ${projectId}
        AND (
          p.created_by = ${userId}
          OR pm.user_id = ${userId}
        )

      GROUP BY p.project_id;
    `;

    if (result.length === 0) {
      throw new ErrorHandler(404, "Project not found");
    }

    return res.status(200).json({
      message: "Get project progress successfully",
      progress: result[0],
    });
  } catch (error) {
    console.error("Get project progress error:", error);

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

export const updateProject = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.userId;
    const projectId = req.params.projectId;

    const { name, description, due_date } = req.body;

    if (!user) {
      throw new ErrorHandler(401, "Athentication required");
    }

    if (typeof name !== "string" || !name.trim()) {
      throw new ErrorHandler(400, "Project name is required");
    }

    if (
      description !== undefined &&
      description !== null &&
      typeof description !== "string"
    ) {
      throw new ErrorHandler(400, "Invalid description");
    }

    if (
      due_date !== undefined &&
      due_date !== null &&
      due_date !== "" &&
      (typeof due_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(due_date) ||
        Number.isNaN(Date.parse(`${due_date}T00:00:00Z`)) ||
        new Date(`${due_date}T00:00:00Z`).toISOString().slice(0, 10) !==
          due_date)
    ) {
      throw new ErrorHandler(400, "Invalid due date");
    }

    const dueDate = due_date || null;

    const [getProjectId] = await sql`SELECT project_id FROM projects 
    WHERE project_id = ${projectId}`;

    if (!getProjectId) {
      throw new ErrorHandler(404, "project not found or you don't have access");
    }

    const [role] = await sql`SELECT role FROM project_members
    WHERE project_id = ${getProjectId.project_id} AND user_id = ${user}`;

    if (!role) {
      throw new ErrorHandler(404, "project not found or you don't have access");
    }

    if (role.role !== "Admin") {
      throw new ErrorHandler(
        403,
        "You don't have permission to update project",
      );
    }

    const [updatingProject] = await sql`UPDATE projects 
    SET name = ${name}, description = ${description}, due_date = ${dueDate}, updated_at = NOW()
    WHERE project_id = ${getProjectId.project_id}
    RETURNING project_id, name, description, image_url, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, updated_at`;

    res.status(200).json({
      message: "Update project successfully",
      project: updatingProject,
    });
  } catch (error) {
    console.error("Update project error:", error);

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

export const updateRole = async (req: AuthRequest, res: Response) => {
  // user
  // ↓
  // "Người đang làm hành động"
  // → kiểm tra role của người này

  // targetUserId
  // ↓
  // "Người bị tác động"
  // → kiểm tra có tồn tại
  // → update role của người này
  try {
    //Kiem tra da dang nhap chua
    //Người đang thực hiện hành động
    const user = req.userId;
    const projectId = req.params.projectId;
    //Id nay la cua user (hoac cua nguoi khac) lay tu URL dung de xem user nay co trong project nay khong
    //Va cung nhu dung de update role
    //Người bị thay đổi role
    const targetUserId = req.params.userId;
    const { role } = req.body;

    if (!user) {
      throw new ErrorHandler(401, "Authentication required");
    }

    if (!role) {
      throw new ErrorHandler(400, "Please provide a role");
    }

    if (role !== "Admin" && role !== "Member") {
      throw new ErrorHandler(400, "Invalid role");
    }

    const [currentMember] = await sql`SELECT role from project_members
    WHERE project_id = ${projectId} AND user_id = ${user}`;

    if (!currentMember) {
      throw new ErrorHandler(404, "project not found or you don't have access");
    }

    if (currentMember.role !== "Admin") {
      throw new ErrorHandler(403, "You don't have permission to update role");
    }

    const [targetMember] = await sql`SELECT project_id, user_id 
    FROM project_members WHERE project_id = ${projectId} AND user_id = ${targetUserId}`;

    if (!targetMember) {
      throw new ErrorHandler(404, "project not found or you don't have access");
    }

    if (user === targetUserId) {
      throw new ErrorHandler(403, "You can't change your own role");
    }

    //Admin A có thể đổi role của Member B targetUserId.
    const [updatingRole] = await sql`UPDATE project_members
    SET role = ${role}
    WHERE project_id = ${projectId} AND user_id = ${targetUserId}
    RETURNING user_id, role`;

    res.status(200).json({
      message: "Update role successfully",
      role: updatingRole,
    });
  } catch (error) {
    console.error("Update role error:", error);

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

export const deleteProject = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.userId;
    const projectId = req.params.projectId;

    if (!user) {
      throw new ErrorHandler(401, "Authentication required");
    }

    if (!projectId) {
      throw new ErrorHandler(404, "project not found or you don't have access");
    }

    const [currentMember] = await sql`SELECT project_id, user_id, role
    FROM project_members WHERE project_id = ${projectId} AND user_id = ${user}`;

    if (!currentMember) {
      throw new ErrorHandler(404, "project not found or you don't have access");
    }

    if (currentMember.role !== "Admin") {
      throw new ErrorHandler(
        403,
        "You don't have permission to delete this project",
      );
    }

    await sql`DELETE FROM projects WHERE project_id = ${projectId}`;

    res.status(200).json({
      message: "Delete project successfully",
    });
  } catch (error) {
    console.error("Delete project error:", error);

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
