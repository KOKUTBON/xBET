/**
 * User In-App Notification Center & Inbox Manager
 * Manages player dashboard bell notifications, unread badges, and read state.
 */

import { randomUUID } from 'crypto';

export interface InAppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  ctaUrl?: string;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date | null;
}

export class InboxManager {
  private static instance: InboxManager;
  private notifications: Map<string, InAppNotification[]> = new Map();

  private constructor() {}

  public static getInstance(): InboxManager {
    if (!InboxManager.instance) {
      InboxManager.instance = new InboxManager();
    }
    return InboxManager.instance;
  }

  public pushNotification(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    ctaUrl?: string;
  }): InAppNotification {
    const id = randomUUID();
    const notification: InAppNotification = {
      id,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      ctaUrl: params.ctaUrl,
      isRead: false,
      createdAt: new Date(),
      readAt: null,
    };

    if (!this.notifications.has(params.userId)) {
      this.notifications.set(params.userId, []);
    }
    this.notifications.get(params.userId)!.unshift(notification);

    console.log(`[InboxManager] Pushed notification '${params.title}' to User ${params.userId}`);
    return notification;
  }

  public getUserNotifications(userId: string, onlyUnread: boolean = false): InAppNotification[] {
    const list = this.notifications.get(userId) || [];
    if (onlyUnread) {
      return list.filter((n) => !n.isRead);
    }
    return [...list];
  }

  public getUnreadCount(userId: string): number {
    const list = this.notifications.get(userId) || [];
    return list.filter((n) => !n.isRead).length;
  }

  public markAsRead(notificationId: string, userId?: string): InAppNotification | null {
    if (userId) {
      const list = this.notifications.get(userId) || [];
      const notification = list.find((n) => n.id === notificationId);
      if (notification) {
        notification.isRead = true;
        notification.readAt = new Date();
        return notification;
      }
      return null;
    }

    // Search across all users
    for (const list of this.notifications.values()) {
      const notification = list.find((n) => n.id === notificationId);
      if (notification) {
        notification.isRead = true;
        notification.readAt = new Date();
        return notification;
      }
    }
    return null;
  }

  public markAllAsRead(userId: string): number {
    const list = this.notifications.get(userId) || [];
    let count = 0;
    for (const n of list) {
      if (!n.isRead) {
        n.isRead = true;
        n.readAt = new Date();
        count++;
      }
    }
    return count;
  }
}
