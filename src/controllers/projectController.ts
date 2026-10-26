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

    const { name, description } = req.body;
    const createdBy = user;

    if (typeof name !== "string" || name.trim() === "") {
      throw new ErrorHandler(400, "Name is required");
    }

    const existProject =
      await sql`SELECT project_id from projects WHERE name = ${name}`;

    if (existProject.length > 0) {
      throw new ErrorHandler(409, "project with this name already exists");
    }

    await sql`BEGIN`;

    const project =
      await sql`INSERT INTO projects (name, description, created_by) VALUES
    (${name}, ${description}, ${createdBy}) RETURNING
    project_id, name, description, created_by, created_at`;

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
    throw error;
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
        u.name AS created_by_name,
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

export const updateProject = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.userId;
    const projectId = req.params.projectId;

    const { name, description } = req.body;

    if (!user) {
      throw new ErrorHandler(401, "Athentication required");
    }

    if (!name || !description) {
      throw new ErrorHandler(400, "Please fill all details");
    }

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
    SET name = ${name}, description = ${description}, updated_at = NOW()
    WHERE project_id = ${getProjectId.project_id}
    RETURNING name, description, updated_at`;

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
