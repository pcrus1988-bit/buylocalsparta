export type NotificationChannel = "in_app" | "email" | "sms" | "push";
export type NotificationStatus = "queued" | "sending" | "sent" | "failed";
export type NotificationPurpose = "transactional" | "service" | "marketing";
export type NotificationCenterGroup = "orders" | "delivery" | "advice" | "saved" | "returns" | "safety" | "account" | "other";

export interface Notification {
  id: string;
  userId?: string;
  vendorId?: string;
  channel: NotificationChannel;
  purpose: NotificationPurpose;
  eventType: string;
  templateVersion: string;
  locale: "el" | "en";
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  dedupeKey?: string;
  providerMessageId?: string;
  sentAt?: number;
  failedAt?: number;
  readAt?: number;
  archivedAt?: number;
  deliveryAttempts: number;
  nextAttemptAt?: number;
  deliveryLeaseOwner?: string;
  deliveryLeaseUntil?: number;
  lastDeliveryError?: string;
  createdAt: number;
}

export interface NotificationTemplate {
  id: string;
  eventType: string;
  channel: Exclude<NotificationChannel, "in_app">;
  locale: "el" | "en";
  purpose: NotificationPurpose;
  revision: number;
  titleTemplate: string;
  bodyTemplate: string;
  required: boolean;
  active: boolean;
  createdBy: string;
  createdAt: number;
}

export interface NotificationPreference {
  id: string;
  targetType: "user" | "vendor";
  targetId: string;
  channel: Exclude<NotificationChannel, "in_app">;
  eventType: string;
  enabled: boolean;
  updatedAt: number;
}

export interface NotificationDeliveryAttempt {
  id: string;
  notificationId: string;
  attempt: number;
  channel: Exclude<NotificationChannel, "in_app">;
  provider: string;
  status: "sent" | "failed";
  maskedDestination: string;
  providerMessageId?: string;
  error?: string;
  startedAt: number;
  completedAt: number;
}

export type NotificationDestination = {
  channel: Exclude<NotificationChannel, "in_app">;
  value: string;
};
