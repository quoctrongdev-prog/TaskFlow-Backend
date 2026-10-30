interface User {
  user_id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string;
  email_verified: boolean;
}

interface UserToken {
  user_id: string;
}

type NotificationEntityType = "project" | "task";

type CreateNotificationData = {
  userId: string;
  actorUserId?: string | null;
  type: string;
  title: string;
  message: string;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
};

export { User, UserToken, NotificationEntityType, CreateNotificationData };
