import { createPortal } from 'react-dom';
import { useOverlayStore } from '@renderer/stores/overlayStore';
import { CommandPalette } from './CommandPalette';
import type React from 'react';

export const OverlayHost = (): React.JSX.Element | null => {
  const isCommandPaletteOpen = useOverlayStore((state) => state.isCommandPaletteOpen);
  const activeDialog = useOverlayStore((state) => state.activeDialog);
  const closeDialog = useOverlayStore((state) => state.closeDialog);

  const portalContainer = document.body;

  const overlayElement = (
    <>
      {/* Renders global Command Palette */}
      {isCommandPaletteOpen && <CommandPalette />}

      {/* Renders dynamic Modal/Dialog layer */}
      {activeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-lg border border-line bg-ink-950 p-6 shadow-2xl font-sans text-readable">
            <h3 className="text-sm font-semibold mb-2">Dialog Alert</h3>
            <p className="text-xs text-muted mb-4">
              Centralized dynamic modal layer triggers successfully.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                className="h-8 rounded bg-ink-800 hover:bg-ink-700 px-4 text-xs font-semibold"
                onClick={closeDialog}
              >
                Close Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(overlayElement, portalContainer);
};
export default OverlayHost;
