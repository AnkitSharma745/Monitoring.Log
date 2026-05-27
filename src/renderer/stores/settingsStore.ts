import { create } from 'zustand';

import type { LogSeverity } from '@renderer/features/logViewer/logParsing';

export type DensityMode = 'compact' | 'comfortable';
export type ThemePreference = 'light' | 'dark';

export interface FeatureVisibilityPreferences {
  aiEvidence: boolean;
  incidents: boolean;
  telemetry: boolean;
  diagnostics: boolean;
  timeline: boolean;
  advancedBadges: boolean;
}

export interface ViewerPreferences {
  autoScroll: boolean;
  lineWrap: boolean;
  showLineNumbers: boolean;
  filterToMatches: boolean;
  compactMode: boolean;
  collapseRepeatedLogs: boolean;
  severityFilters: Record<LogSeverity, boolean>;
  includeFilter: string;
  excludeFilter: string;
  enableHeuristicHints: boolean;
  showIngestionTrace: boolean;
  featureVisibility: FeatureVisibilityPreferences;
}

const createEnabledSeverityFilters = (): Record<LogSeverity, boolean> => {
  return {
    error: true,
    warn: true,
    info: true,
    debug: true,
    neutral: true,
  };
};

const createDefaultFeatureVisibility = (): FeatureVisibilityPreferences => {
  return {
    aiEvidence: true,
    incidents: true,
    telemetry: true,
    diagnostics: true,
    timeline: true,
    advancedBadges: true,
  };
};

const createDefaultPreferences = (): ViewerPreferences => {
  return {
    autoScroll: true,
    lineWrap: true,
    showLineNumbers: true,
    filterToMatches: false,
    compactMode: false,
    collapseRepeatedLogs: true,
    severityFilters: createEnabledSeverityFilters(),
    includeFilter: '',
    excludeFilter: '',
    enableHeuristicHints: true,
    showIngestionTrace: true,
    featureVisibility: createDefaultFeatureVisibility(),
  };
};

interface SettingsStoreState {
  density: DensityMode;
  theme: ThemePreference;
  preferences: ViewerPreferences;
  isSettingsOpen: boolean;
  isAdvancedSettingsOpen: boolean;
  setDensity: (density: DensityMode) => void;
  setTheme: (theme: ThemePreference) => void;
  toggleSettingsPanel: () => void;
  closeSettingsPanel: () => void;
  openAdvancedSettings: () => void;
  closeAdvancedSettings: () => void;
  toggleAutoScroll: () => void;
  toggleLineWrap: () => void;
  toggleLineNumbers: () => void;
  toggleFilterToMatches: () => void;
  toggleCompactMode: () => void;
  toggleCollapseRepeatedLogs: () => void;
  toggleSeverityFilter: (severity: LogSeverity) => void;
  toggleEnableHeuristicHints: () => void;
  toggleShowIngestionTrace: () => void;
  setFeatureVisibility: (key: keyof FeatureVisibilityPreferences, visible: boolean) => void;
  setIncludeFilter: (val: string) => void;
  setExcludeFilter: (val: string) => void;
  resetLogFilters: () => void;
}

const STORAGE_KEY = 'monitoring-log.settings.v1';

const mergePreferencesWithDefaults = (
  userPrefs: Partial<ViewerPreferences> | null | undefined,
): ViewerPreferences => {
  const defaults = createDefaultPreferences();
  if (!userPrefs) return defaults;
  return {
    ...defaults,
    ...userPrefs,
    severityFilters: {
      ...defaults.severityFilters,
      ...(userPrefs.severityFilters || {}),
    },
    featureVisibility: {
      ...defaults.featureVisibility,
      ...(userPrefs.featureVisibility || {}),
    },
  };
};

const updateFeatureVisibility = (
  preferences: ViewerPreferences,
  key: keyof FeatureVisibilityPreferences,
  visible: boolean,
): FeatureVisibilityPreferences => {
  const current = preferences.featureVisibility;
  switch (key) {
    case 'aiEvidence':
      return { ...current, aiEvidence: visible };
    case 'incidents':
      return { ...current, incidents: visible };
    case 'telemetry':
      return { ...current, telemetry: visible };
    case 'diagnostics':
      return { ...current, diagnostics: visible };
    case 'timeline':
      return { ...current, timeline: visible };
    case 'advancedBadges':
      return { ...current, advancedBadges: visible };
    default:
      return current;
  }
};

const readPersistedSettings = (): {
  density: DensityMode;
  theme: ThemePreference;
  preferences: ViewerPreferences;
} | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<{
      density: DensityMode;
      theme: ThemePreference;
      preferences: Partial<ViewerPreferences>;
    }>;

    return {
      density: parsed.density ?? 'compact',
      theme: parsed.theme ?? 'light',
      preferences: mergePreferencesWithDefaults(parsed?.preferences),
    };
  } catch {
    return null;
  }
};

const persisted = readPersistedSettings();

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  density: persisted?.density ?? 'compact',
  theme: persisted?.theme ?? 'light',
  preferences: persisted?.preferences ?? createDefaultPreferences(),
  isSettingsOpen: false,
  isAdvancedSettingsOpen: false,

  setDensity: (density): void => {
    set({ density });
  },

  setTheme: (theme): void => {
    set({ theme });
    const root = document.documentElement;
    root.classList.toggle('theme-dark', theme === 'dark');
    root.dataset['theme'] = theme;
  },

  toggleSettingsPanel: (): void => {
    set((state) => ({ isSettingsOpen: !state.isSettingsOpen }));
  },

  closeSettingsPanel: (): void => {
    set({ isSettingsOpen: false });
  },

  openAdvancedSettings: (): void => {
    set({ isAdvancedSettingsOpen: true, isSettingsOpen: false });
  },

  closeAdvancedSettings: (): void => {
    set({ isAdvancedSettingsOpen: false });
  },

  toggleAutoScroll: (): void => {
    set((state) => ({
      preferences: { ...state.preferences, autoScroll: !state.preferences.autoScroll },
    }));
  },

  toggleLineWrap: (): void => {
    set((state) => ({
      preferences: { ...state.preferences, lineWrap: !state.preferences.lineWrap },
    }));
  },

  toggleLineNumbers: (): void => {
    set((state) => ({
      preferences: { ...state.preferences, showLineNumbers: !state.preferences.showLineNumbers },
    }));
  },

  toggleFilterToMatches: (): void => {
    set((state) => ({
      preferences: { ...state.preferences, filterToMatches: !state.preferences.filterToMatches },
    }));
  },

  toggleCompactMode: (): void => {
    set((state) => ({
      preferences: { ...state.preferences, compactMode: !state.preferences.compactMode },
    }));
  },

  toggleCollapseRepeatedLogs: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        collapseRepeatedLogs: !state.preferences.collapseRepeatedLogs,
      },
    }));
  },

  toggleSeverityFilter: (severity): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        severityFilters: {
          ...state.preferences.severityFilters,
          [severity]: !state.preferences.severityFilters[severity],
        },
      },
    }));
  },

  toggleEnableHeuristicHints: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        enableHeuristicHints: !state.preferences.enableHeuristicHints,
      },
    }));
  },

  toggleShowIngestionTrace: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        showIngestionTrace: !state.preferences.showIngestionTrace,
      },
    }));
  },

  setFeatureVisibility: (key, visible): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        featureVisibility: updateFeatureVisibility(state.preferences, key, visible),
      },
    }));
  },

  setIncludeFilter: (val): void => {
    set((state) => ({
      preferences: { ...state.preferences, includeFilter: val },
    }));
  },

  setExcludeFilter: (val): void => {
    set((state) => ({
      preferences: { ...state.preferences, excludeFilter: val },
    }));
  },

  resetLogFilters: (): void => {
    set((state) => ({
      preferences: {
        ...state.preferences,
        filterToMatches: false,
        severityFilters: createEnabledSeverityFilters(),
        includeFilter: '',
        excludeFilter: '',
        enableHeuristicHints: true,
        showIngestionTrace: true,
        featureVisibility: {
          ...state.preferences.featureVisibility,
        },
      },
    }));
  },
}));

useSettingsStore.subscribe((state) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        density: state.density,
        theme: state.theme,
        preferences: state.preferences,
      }),
    );
  } catch {
    // ignore
  }
});
