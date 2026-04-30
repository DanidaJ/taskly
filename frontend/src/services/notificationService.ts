// Smart Notification Service
// Handles browser notifications, push notifications, and in-app reminders

export type NotificationType = 'reminder' | 'break' | 'reflection' | 'achievement' | 'insight';

export interface ScheduledNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  scheduledTime: Date;
  taskId?: string;
  sent: boolean;
}

interface NotificationPreferences {
  enabled: boolean;
  taskReminders: boolean;
  breakReminders: boolean;
  reflectionReminders: boolean;
  achievementNotifications: boolean;
  quietHoursStart: string; // HH:MM
  quietHoursEnd: string;
  reminderMinutesBefore: number;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  taskReminders: true,
  breakReminders: true,
  reflectionReminders: true,
  achievementNotifications: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  reminderMinutesBefore: 15,
};

class NotificationService {
  private permissions: NotificationPermission = 'default';
  private preferences: NotificationPreferences = DEFAULT_PREFERENCES;
  private scheduledNotifications: ScheduledNotification[] = [];
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadPreferences();
    this.checkPermissions();
    this.startNotificationChecker();
  }

  private loadPreferences() {
    const saved = localStorage.getItem('planiq-notification-preferences');
    if (saved) {
      this.preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
    }
  }

  private savePreferences() {
    localStorage.setItem('planiq-notification-preferences', JSON.stringify(this.preferences));
  }

  private async checkPermissions() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }
    this.permissions = Notification.permission;
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    const permission = await Notification.requestPermission();
    this.permissions = permission;
    return permission === 'granted';
  }

  isEnabled(): boolean {
    return this.permissions === 'granted' && this.preferences.enabled;
  }

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  updatePreferences(updates: Partial<NotificationPreferences>) {
    this.preferences = { ...this.preferences, ...updates };
    this.savePreferences();
  }

  private isQuietHours(): boolean {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = this.preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = this.preferences.quietHoursEnd.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes > endMinutes) {
      // Quiet hours span midnight
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  async sendNotification(
    type: NotificationType,
    title: string,
    body: string,
    options?: { icon?: string; tag?: string; requireInteraction?: boolean }
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    if (this.isQuietHours()) {
      console.log('Notification suppressed due to quiet hours');
      return false;
    }

    // Check type-specific preferences
    if (type === 'reminder' && !this.preferences.taskReminders) return false;
    if (type === 'break' && !this.preferences.breakReminders) return false;
    if (type === 'reflection' && !this.preferences.reflectionReminders) return false;
    if (type === 'achievement' && !this.preferences.achievementNotifications) return false;

    try {
      const notification = new Notification(title, {
        body,
        icon: options?.icon || '/favicon.ico',
        tag: options?.tag,
        requireInteraction: options?.requireInteraction,
        badge: '/favicon.ico',
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000);

      return true;
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }

  scheduleNotification(
    type: NotificationType,
    title: string,
    body: string,
    scheduledTime: Date,
    taskId?: string
  ): string {
    const notification: ScheduledNotification = {
      id: Date.now().toString(),
      type,
      title,
      body,
      scheduledTime,
      taskId,
      sent: false,
    };

    this.scheduledNotifications.push(notification);
    this.saveScheduledNotifications();

    return notification.id;
  }

  cancelNotification(id: string) {
    this.scheduledNotifications = this.scheduledNotifications.filter(n => n.id !== id);
    this.saveScheduledNotifications();
  }

  cancelTaskNotifications(taskId: string) {
    this.scheduledNotifications = this.scheduledNotifications.filter(
      n => n.taskId !== taskId
    );
    this.saveScheduledNotifications();
  }

  private saveScheduledNotifications() {
    localStorage.setItem(
      'planiq-scheduled-notifications',
      JSON.stringify(this.scheduledNotifications)
    );
  }

  private loadScheduledNotifications() {
    const saved = localStorage.getItem('planiq-scheduled-notifications');
    if (saved) {
      this.scheduledNotifications = JSON.parse(saved).map((n: ScheduledNotification) => ({
        ...n,
        scheduledTime: new Date(n.scheduledTime),
      }));
    }
  }

  private startNotificationChecker() {
    this.loadScheduledNotifications();

    // Check every minute for scheduled notifications
    this.checkInterval = setInterval(() => {
      this.checkScheduledNotifications();
    }, 60000);

    // Also check immediately
    this.checkScheduledNotifications();
  }

  private checkScheduledNotifications() {
    const now = new Date();
    
    this.scheduledNotifications.forEach(notification => {
      if (!notification.sent && notification.scheduledTime <= now) {
        this.sendNotification(
          notification.type,
          notification.title,
          notification.body
        );
        notification.sent = true;
      }
    });

    // Clean up old sent notifications
    this.scheduledNotifications = this.scheduledNotifications.filter(
      n => !n.sent || n.scheduledTime > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    this.saveScheduledNotifications();
  }

  // Helper methods for common notifications

  scheduleTaskReminder(taskName: string, startTime: Date, taskId: string) {
    const reminderTime = new Date(
      startTime.getTime() - this.preferences.reminderMinutesBefore * 60 * 1000
    );

    if (reminderTime > new Date()) {
      return this.scheduleNotification(
        'reminder',
        'Task Starting Soon',
        `"${taskName}" starts in ${this.preferences.reminderMinutesBefore} minutes`,
        reminderTime,
        taskId
      );
    }
    return null;
  }

  sendBreakReminder() {
    return this.sendNotification(
      'break',
      'Time for a Break! ☕',
      "You've been working for a while. Take a short break to recharge.",
      { requireInteraction: true }
    );
  }

  sendReflectionReminder() {
    return this.sendNotification(
      'reflection',
      'Daily Reflection Time 📝',
      'Take a few minutes to reflect on your day and plan for tomorrow.',
      { requireInteraction: true }
    );
  }

  sendAchievementNotification(title: string, description: string) {
    return this.sendNotification(
      'achievement',
      `🎉 ${title}`,
      description
    );
  }

  sendInsightNotification(insight: string) {
    return this.sendNotification(
      'insight',
      '💡 Productivity Insight',
      insight
    );
  }

  // Schedule end-of-day reflection reminder
  scheduleReflectionReminder(time: string = '20:00') {
    const [hour, minute] = time.split(':').map(Number);
    const now = new Date();
    const reminderTime = new Date(now);
    reminderTime.setHours(hour, minute, 0, 0);

    if (reminderTime <= now) {
      // Schedule for tomorrow if time has passed
      reminderTime.setDate(reminderTime.getDate() + 1);
    }

    return this.scheduleNotification(
      'reflection',
      'Daily Reflection Time 📝',
      'Take a few minutes to reflect on your day.',
      reminderTime
    );
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

// Singleton instance
export const notificationService = new NotificationService();
export default notificationService;
