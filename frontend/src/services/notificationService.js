import { api } from "../utils/api";

export async function fetchNotifications(userId) {
  if (!userId) return { items: [], unread: 0 };
  const res = await api.get(`/notifications/${encodeURIComponent(userId)}`);
  return res.data || { items: [], unread: 0 };
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return;
  await api.put(`/notifications/read/${notificationId}`);
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return;
  await api.put(`/notifications/read-all/${encodeURIComponent(userId)}`);
}

