import { create } from 'zustand';

import { useViewerStore } from './viewerStore';
import type { SearchCacheSummary, SearchResult } from '@shared/contracts/search';

const MAX_RECENT_ITEMS = 12;

interface SearchStoreState {
  searchQuery: string;
  searchHistory: string[];
  activeSearchMatchIndex: number;
  activeQueryId: string | null;
  cachedQueries: SearchCacheSummary[];
  resultsByQueryId: Record<string, SearchResult>;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  setSearchQuery: (query: string) => void;
  setSearchOptions: (opts: Partial<{ isRegex: boolean; isCaseSensitive: boolean; isWholeWord: boolean }>) => void;
  selectNextSearchMatch: () => void;
  selectPreviousSearchMatch: () => void;
  saveCurrentSearch: () => void;
  setActiveQuery: (queryId: string | null) => void;
  registerResult: (result: SearchResult) => void;
  clearSearchHistory: () => void;
  setSearchHistory: (history: string[]) => void;
}

export const useSearchStore = create<SearchStoreState>((set, get) => ({
  searchQuery: '',
  searchHistory: [],
  activeSearchMatchIndex: 0,
  activeQueryId: null,
  cachedQueries: [],
  resultsByQueryId: {},
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
    const matchedIndices = useViewerStore.getState().viewportMatchedIndicesByPath[activeFilePath] ?? [];
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
    const matchedIndices = useViewerStore.getState().viewportMatchedIndicesByPath[activeFilePath] ?? [];
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

  setActiveQuery: (queryId): void => {
    set({ activeQueryId: queryId });
  },

  registerResult: (result): void => {
    set((state) => ({
      activeQueryId: result.queryId,
      resultsByQueryId: {
        ...state.resultsByQueryId,
        [result.queryId]: result,
      },
    }));
  },

  clearSearchHistory: (): void => {
    set({ searchHistory: [] });
  },

  setSearchHistory: (history): void => {
    set({ searchHistory: history.slice(0, MAX_RECENT_ITEMS) });
  },
}));
