import { create } from 'zustand';

import { useSettingsStore } from './settingsStore';
import { useViewerStore } from './viewerStore';
import type {
  SavedInvestigationFilter,
  SearchCacheSummary,
  SearchResult,
} from '@shared/contracts/search';

const MAX_RECENT_ITEMS = 12;
const MAX_SAVED_FILTERS = 24;
const STORAGE_KEY = 'monitoring-log.search.v1';

const DEFAULT_OPERATIONAL_FILTERS: SavedInvestigationFilter[] = [
  {
    id: 'preset-payment-failures',
    name: 'Payment Failures',
    searchText: 'payment|transaction|declined|failed',
    includeFilter: '',
    excludeFilter: '',
    severityFilters: { error: true, warn: true, info: false, debug: false, neutral: false },
    isRegex: true,
    isCaseSensitive: false,
    isWholeWord: false,
    createdAt: 'preset',
    lastUsedAt: 'preset',
  },
  {
    id: 'preset-timeouts',
    name: 'Timeout Chains',
    searchText: 'timeout|timed out|deadline|retry',
    includeFilter: '',
    excludeFilter: '',
    severityFilters: { error: true, warn: true, info: true, debug: false, neutral: false },
    isRegex: true,
    isCaseSensitive: false,
    isWholeWord: false,
    createdAt: 'preset',
    lastUsedAt: 'preset',
  },
  {
    id: 'preset-heartbeat',
    name: 'Heartbeat Instability',
    searchText: 'heartbeat|ping|offline|disconnect',
    includeFilter: '',
    excludeFilter: '',
    severityFilters: { error: true, warn: true, info: true, debug: false, neutral: false },
    isRegex: true,
    isCaseSensitive: false,
    isWholeWord: false,
    createdAt: 'preset',
    lastUsedAt: 'preset',
  },
];

interface SearchStoreState {
  searchQuery: string;
  searchHistory: string[];
  activeSearchMatchIndex: number;
  activeQueryId: string | null;
  cachedQueries: SearchCacheSummary[];
  resultsByQueryId: Record<string, SearchResult>;
  savedFilters: SavedInvestigationFilter[];
  isSearching: boolean;
  searchError: string | null;
  lastSearchStatus: SearchResult['status'] | null;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  setSearchQuery: (query: string) => void;
  setSearchOptions: (
    opts: Partial<{ isRegex: boolean; isCaseSensitive: boolean; isWholeWord: boolean }>,
  ) => void;
  selectNextSearchMatch: () => void;
  selectPreviousSearchMatch: () => void;
  saveCurrentSearch: () => void;
  saveCurrentFilter: (name?: string) => void;
  applySavedFilter: (filterId: string) => void;
  deleteSavedFilter: (filterId: string) => void;
  setActiveQuery: (queryId: string | null) => void;
  registerResult: (result: SearchResult) => void;
  setSearchRunning: (running: boolean) => void;
  setSearchError: (message: string | null) => void;
  clearSearchHistory: () => void;
  setSearchHistory: (history: string[]) => void;
}

const readPersistedSearch = (): Pick<SearchStoreState, 'searchHistory' | 'savedFilters'> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { searchHistory: [], savedFilters: DEFAULT_OPERATIONAL_FILTERS };
    }

    const parsed = JSON.parse(raw) as Partial<{
      searchHistory: string[];
      savedFilters: SavedInvestigationFilter[];
    }>;

    const customFilters = (parsed.savedFilters ?? []).filter((filter) => filter.id);
    const presetIds = new Set(DEFAULT_OPERATIONAL_FILTERS.map((filter) => filter.id));
    const mergedFilters = [
      ...DEFAULT_OPERATIONAL_FILTERS,
      ...customFilters.filter((filter) => !presetIds.has(filter.id)),
    ].slice(0, MAX_SAVED_FILTERS);

    return {
      searchHistory: (parsed.searchHistory ?? []).slice(0, MAX_RECENT_ITEMS),
      savedFilters: mergedFilters,
    };
  } catch {
    return { searchHistory: [], savedFilters: DEFAULT_OPERATIONAL_FILTERS };
  }
};

const persistedSearch = readPersistedSearch();

export const useSearchStore = create<SearchStoreState>((set, get) => ({
  searchQuery: '',
  searchHistory: persistedSearch.searchHistory,
  activeSearchMatchIndex: 0,
  activeQueryId: null,
  cachedQueries: [],
  resultsByQueryId: {},
  savedFilters: persistedSearch.savedFilters,
  isSearching: false,
  searchError: null,
  lastSearchStatus: null,
  isRegex: false,
  isCaseSensitive: false,
  isWholeWord: false,

  setSearchQuery: (query): void => {
    set({ searchQuery: query, activeSearchMatchIndex: 0 });
  },

  setSearchOptions: (opts): void => {
    set((state) => ({ ...state, ...opts, activeSearchMatchIndex: 0 }));
  },

  selectNextSearchMatch: (): void => {
    const activeFilePath = useViewerStore.getState().selectedFilePath;
    if (!activeFilePath) return;
    const matchedIndices =
      useViewerStore.getState().viewportMatchedIndicesByPath[activeFilePath] ?? [];
    const total = matchedIndices.length;
    if (total === 0) return;
    set((state) => {
      const nextIndex = (state.activeSearchMatchIndex + 1) % total;
      const targetRow = matchedIndices[nextIndex] ?? null;
      useViewerStore.getState().scrollToLineRowIndex(targetRow, activeFilePath);
      return { activeSearchMatchIndex: nextIndex };
    });
  },

  selectPreviousSearchMatch: (): void => {
    const activeFilePath = useViewerStore.getState().selectedFilePath;
    if (!activeFilePath) return;
    const matchedIndices =
      useViewerStore.getState().viewportMatchedIndicesByPath[activeFilePath] ?? [];
    const total = matchedIndices.length;
    if (total === 0) return;
    set((state) => {
      const prevIndex = (state.activeSearchMatchIndex - 1 + total) % total;
      const targetRow = matchedIndices[prevIndex] ?? null;
      useViewerStore.getState().scrollToLineRowIndex(targetRow, activeFilePath);
      return { activeSearchMatchIndex: prevIndex };
    });
  },

  saveCurrentSearch: (): void => {
    const query = get().searchQuery.trim();

    if (!query) {
      return;
    }

    set((state) => ({
      searchHistory: [query, ...state.searchHistory.filter((item) => item !== query)].slice(
        0,
        MAX_RECENT_ITEMS,
      ),
    }));
  },

  saveCurrentFilter: (name): void => {
    const state = get();
    const settings = useSettingsStore.getState();
    const now = new Date().toISOString();
    const filterName = name?.trim() || state.searchQuery.trim() || 'Investigation Filter';

    const filter: SavedInvestigationFilter = {
      id: `filter:${Date.now()}`,
      name: filterName,
      searchText: state.searchQuery,
      includeFilter: settings.preferences.includeFilter,
      excludeFilter: settings.preferences.excludeFilter,
      severityFilters: settings.preferences.severityFilters,
      isRegex: state.isRegex,
      isCaseSensitive: state.isCaseSensitive,
      isWholeWord: state.isWholeWord,
      createdAt: now,
      lastUsedAt: now,
    };

    set((current) => ({
      savedFilters: [
        filter,
        ...current.savedFilters.filter((item) => item.name !== filter.name),
      ].slice(0, MAX_SAVED_FILTERS),
    }));
  },

  applySavedFilter: (filterId): void => {
    const filter = get().savedFilters.find((item) => item.id === filterId);
    if (!filter) return;

    useSettingsStore.setState((state) => ({
      preferences: {
        ...state.preferences,
        includeFilter: filter.includeFilter,
        excludeFilter: filter.excludeFilter,
        severityFilters: filter.severityFilters,
      },
    }));

    set((state) => ({
      searchQuery: filter.searchText,
      isRegex: filter.isRegex,
      isCaseSensitive: filter.isCaseSensitive,
      isWholeWord: filter.isWholeWord,
      activeSearchMatchIndex: 0,
      savedFilters: state.savedFilters.map((item) =>
        item.id === filterId ? { ...item, lastUsedAt: new Date().toISOString() } : item,
      ),
    }));
  },

  deleteSavedFilter: (filterId): void => {
    set((state) => ({
      savedFilters: state.savedFilters.filter(
        (filter) => filter.id !== filterId || filter.createdAt === 'preset',
      ),
    }));
  },

  setActiveQuery: (queryId): void => {
    set({ activeQueryId: queryId });
  },

  registerResult: (result): void => {
    set((state) => ({
      activeQueryId: result.queryId,
      isSearching: false,
      searchError: result.errorMessage ?? null,
      lastSearchStatus: result.status ?? 'complete',
      resultsByQueryId: {
        ...state.resultsByQueryId,
        [result.queryId]: result,
      },
    }));
  },

  setSearchRunning: (running): void => {
    set({ isSearching: running, searchError: running ? null : get().searchError });
  },

  setSearchError: (message): void => {
    set({ searchError: message, isSearching: false });
  },

  clearSearchHistory: (): void => {
    set({ searchHistory: [] });
  },

  setSearchHistory: (history): void => {
    set({ searchHistory: history.slice(0, MAX_RECENT_ITEMS) });
  },
}));

useSearchStore.subscribe((state) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        searchHistory: state.searchHistory,
        savedFilters: state.savedFilters.filter((filter) => filter.createdAt !== 'preset'),
      }),
    );
  } catch {
    // Search persistence is best effort.
  }
});
