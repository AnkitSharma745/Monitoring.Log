import React from 'react';
import { Search } from 'lucide-react';
import { useFileMonitorStore } from '@renderer/stores/fileMonitorStore';
import { WorkbenchPlaceholder } from './WorkbenchPlaceholder';

export const SearchPanel = (): React.JSX.Element => {
  const searchQuery = useFileMonitorStore((state) => state.searchQuery);
  const setSearchQuery = useFileMonitorStore((state) => state.setSearchQuery);

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="border-b border-line p-2">
        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Filter visible logs"
            className="h-8 w-full rounded border border-line bg-ink-950 px-8 text-xs text-readable outline-none focus:border-accent"
          />
        </label>
      </div>
      <WorkbenchPlaceholder title="Search Workspace" />
    </div>
  );
};
export default SearchPanel;
