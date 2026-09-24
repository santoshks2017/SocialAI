import api from './api';
import type { NotificationPrefs, UserPreferences } from '../utils/preferences';
import type { ThemeMode } from '../utils/theme';

export const preferencesService = {
  get: () => api.get<UserPreferences>('/users/me/preferences'),
  update: (change: { theme_mode?: ThemeMode; notification_prefs?: Partial<NotificationPrefs> }) =>
    api.put<UserPreferences>('/users/me/preferences', change),
};
