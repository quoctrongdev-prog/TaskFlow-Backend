import sql from "../config/db.js";
import { CreateNotificationData } from "../config/model.js";

// Service: xử lý logic tạo notification.
// Controller: xử lý HTTP request và response.

export const createNotification = async ({
  userId,
  actorUserId = null,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
}: CreateNotificationData) => {
  const notifications = await sql`
    INSERT INTO notifications (
      user_id,
      actor_user_id,
      type,
      title,
      message,
      entity_type,
      entity_id
    )
    VALUES (
      ${userId},
      ${actorUserId},
      ${type},
      ${title},
      ${message},
      ${entityType},
      ${entityId}
    )
    RETURNING *
  `;

  return notifications[0];
};
