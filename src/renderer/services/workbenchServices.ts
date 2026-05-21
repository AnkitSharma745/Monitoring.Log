import React from 'react';

import { ActivityPanel } from '../features/activity/components/ActivityPanel';
import { FileExplorer } from '../features/files/components/FileExplorer';
import { Sidebar } from '../features/layout/components/Sidebar';
import { DiagnosticsPanel } from '../features/workbench/components/DiagnosticsPanel';
import { InvestigationsPanel } from '../features/workbench/components/InvestigationsPanel';
import { SearchPanel } from '../features/workbench/components/SearchPanel';
import { TimelinePanel } from '../features/workbench/components/TimelinePanel';
import { WorkbenchPlaceholder } from '../features/workbench/components/WorkbenchPlaceholder';
import {
  useWorkbenchStore,
  type WorkbenchSidePanel,
  type WorkbenchBottomPanel,
} from '../features/workbench/workbenchStore';
import { useDiagnosticsStore } from '../stores/diagnosticsStore';
import { useFileMonitorStore } from '../stores/fileMonitorStore';
import { useOverlayStore } from '../stores/overlayStore';

// ==========================================
// 1. VIEW REGISTRY SERVICE
// ==========================================
export interface ViewContribution {
  id: string;
  title: string;
  component: React.ComponentType<any>;
}

class ViewRegistryServiceImpl {
  private sidePanels = new Map<string, ViewContribution>();
  private bottomPanels = new Map<string, ViewContribution>();

  registerSidePanel(id: string, title: string, component: React.ComponentType<any>): void {
    this.sidePanels.set(id, { id, title, component });
  }

  registerBottomPanel(id: string, title: string, component: React.ComponentType<any>): void {
    this.bottomPanels.set(id, { id, title, component });
  }

  getSidePanel(id: string): ViewContribution | undefined {
    return this.sidePanels.get(id);
  }

  getBottomPanel(id: string): ViewContribution | undefined {
    return this.bottomPanels.get(id);
  }

  getSidePanels(): ViewContribution[] {
    return Array.from(this.sidePanels.values());
  }

  getBottomPanels(): ViewContribution[] {
    return Array.from(this.bottomPanels.values());
  }
}

export const ViewRegistryService = new ViewRegistryServiceImpl();

// ==========================================
// 2. COMMAND SERVICE
// ==========================================
export interface CommandContribution {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  handler: (...args: any[]) => void | Promise<void>;
}

class CommandServiceImpl {
  private commands = new Map<string, CommandContribution>();

  registerCommand(command: CommandContribution): void {
    this.commands.set(command.id, command);
  }

  async executeCommand(id: string, ...args: any[]): Promise<any> {
    const command = this.commands.get(id);
    if (!command) {
      console.warn(`Command "${id}" is not registered.`);
      useDiagnosticsStore.getState().addEvent({
        category: 'system',
        severity: 'warning',
        message: `Execution attempted for unregistered command "${id}"`,
      });
      return;
    }
    try {
      const startTime = performance.now();
      const result = await command.handler(...args);
      const durationMs = performance.now() - startTime;
      useDiagnosticsStore.getState().addEvent({
        category: 'performance',
        severity: 'info',
        message: `Command "${id}" executed successfully`,
        durationMs,
      });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during command execution';
      console.error(`Command execution failed: ${id}`, error);
      useDiagnosticsStore.getState().addEvent({
        category: 'system',
        severity: 'error',
        message: `Command "${id}" failed: ${message}`,
      });
      throw error;
    }
  }

  getCommands(): CommandContribution[] {
    return Array.from(this.commands.values());
  }
}

export const CommandService = new CommandServiceImpl();

// ==========================================
// 3. LAYOUT SERVICE
// ==========================================
export const LayoutService = {
  getSidePanelWidth(): number {
    return useWorkbenchStore.getState().sidePanelWidth;
  },
  setSidePanelWidth(width: number): void {
    useWorkbenchStore.getState().setSidePanelWidth(width);
  },
  getBottomPanelHeight(): number {
    return useWorkbenchStore.getState().bottomPanelHeight;
  },
  setBottomPanelHeight(height: number): void {
    useWorkbenchStore.getState().setBottomPanelHeight(height);
  },
  isSidePanelVisible(): boolean {
    return useWorkbenchStore.getState().isSidePanelVisible;
  },
  isBottomPanelVisible(): boolean {
    return useWorkbenchStore.getState().isBottomPanelVisible;
  },
};

// ==========================================
// 4. PANEL SERVICE
// ==========================================
export const PanelService = {
  setActiveSidePanel(panel: WorkbenchSidePanel): void {
    useWorkbenchStore.getState().setActiveSidePanel(panel);
    useDiagnosticsStore.getState().addEvent({
      category: 'viewer',
      severity: 'info',
      message: `Active side panel changed to: ${panel}`,
    });
  },
  toggleSidePanel(): void {
    useWorkbenchStore.getState().toggleSidePanel();
  },
  setActiveBottomPanel(panel: WorkbenchBottomPanel): void {
    useWorkbenchStore.getState().setActiveBottomPanel(panel);
    useDiagnosticsStore.getState().addEvent({
      category: 'viewer',
      severity: 'info',
      message: `Active bottom panel changed to: ${panel}`,
    });
  },
  toggleBottomPanel(): void {
    useWorkbenchStore.getState().toggleBottomPanel();
  },
};

// ==========================================
// 5. WORKSPACE SERVICE
// ==========================================
export const WorkspaceService = {
  async selectFiles(): Promise<void> {
    const start = performance.now();
    await useFileMonitorStore.getState().selectFilesFromDialog();
    useDiagnosticsStore.getState().addEvent({
      category: 'file-system',
      severity: 'info',
      message: 'Files loaded into workspace from dialog',
      durationMs: performance.now() - start,
    });
  },
  async selectDirectory(): Promise<void> {
    const start = performance.now();
    await useFileMonitorStore.getState().selectDirectoryFromDialog();
    useDiagnosticsStore.getState().addEvent({
      category: 'file-system',
      severity: 'info',
      message: 'Workspace directory selected',
      durationMs: performance.now() - start,
    });
  },
  async scanDroppedFiles(files: File[]): Promise<void> {
    const start = performance.now();
    await useFileMonitorStore.getState().scanDroppedFiles(files);
    useDiagnosticsStore.getState().addEvent({
      category: 'file-system',
      severity: 'info',
      message: `Scanned ${files.length} dropped items`,
      durationMs: performance.now() - start,
    });
  },
  removeFile(filePath: string): void {
    useFileMonitorStore.getState().removeFile(filePath);
    useDiagnosticsStore.getState().addEvent({
      category: 'file-system',
      severity: 'info',
      message: `File removed: ${filePath}`,
    });
  },
  removeDirectory(dirPath: string): void {
    useFileMonitorStore.getState().removeDirectory(dirPath);
    useDiagnosticsStore.getState().addEvent({
      category: 'file-system',
      severity: 'info',
      message: `Directory removed: ${dirPath}`,
    });
  },
  clearHistory(): void {
    useFileMonitorStore.getState().clearWorkspaceHistory();
  },
};

// ==========================================
// 6. TAB SERVICE
// ==========================================
export const TabService = {
  closeTab(filePath: string): void {
    useFileMonitorStore.getState().closeTab(filePath);
  },
  pinTab(filePath: string): void {
    useFileMonitorStore.getState().pinTab(filePath);
  },
  selectFile(filePath: string): void {
    void useFileMonitorStore.getState().selectFile(filePath);
  },
};

// ==========================================
// 7. OVERLAY SERVICE
// ==========================================
export const OverlayService = {
  openCommandPalette(): void {
    useOverlayStore.getState().openCommandPalette();
  },
  closeCommandPalette(): void {
    useOverlayStore.getState().closeCommandPalette();
  },
  showDialog(dialogId: string, props?: any): void {
    useOverlayStore.getState().showDialog(dialogId, props);
  },
  closeDialog(): void {
    useOverlayStore.getState().closeDialog();
  },
};

// ==========================================
// 8. SERVICE INITIALIZATION ROUTINE
// ==========================================
export const initializeWorkbench = (): void => {
  // Pre-register all Side Panels
  ViewRegistryService.registerSidePanel('explorer', 'Explorer', FileExplorer);
  ViewRegistryService.registerSidePanel('search', 'Search', SearchPanel);
  ViewRegistryService.registerSidePanel('watchers', 'Watchers', Sidebar);
  ViewRegistryService.registerSidePanel('investigations', 'Investigations', InvestigationsPanel);
  ViewRegistryService.registerSidePanel('timeline', 'Timeline', TimelinePanel);

  // Pre-register all Bottom Panels
  ViewRegistryService.registerBottomPanel('problems', 'Problems', () =>
    React.createElement(WorkbenchPlaceholder, { title: 'Problems' }),
  );
  ViewRegistryService.registerBottomPanel('activity', 'Activity', ActivityPanel);
  ViewRegistryService.registerBottomPanel('aiEvidence', 'AI Evidence', () =>
    React.createElement(WorkbenchPlaceholder, { title: 'AI Evidence' }),
  );
  ViewRegistryService.registerBottomPanel('timeline', 'Timeline', TimelinePanel);
  ViewRegistryService.registerBottomPanel('output', 'Output', () =>
    React.createElement(WorkbenchPlaceholder, { title: 'Output' }),
  );
  ViewRegistryService.registerBottomPanel('performance', 'Performance', () =>
    React.createElement(WorkbenchPlaceholder, { title: 'Performance' }),
  );
  ViewRegistryService.registerBottomPanel('watchers', 'Watchers', () =>
    React.createElement(WorkbenchPlaceholder, { title: 'Watchers' }),
  );
  ViewRegistryService.registerBottomPanel('diagnostics', 'Diagnostics', DiagnosticsPanel);

  // Register Standard Workbench Commands
  CommandService.registerCommand({
    id: 'workbench.action.toggleSidebar',
    title: 'Toggle Side Bar Visibility',
    category: 'View',
    shortcut: 'Ctrl+B',
    handler: () => PanelService.toggleSidePanel(),
  });

  CommandService.registerCommand({
    id: 'workbench.action.toggleBottomPanel',
    title: 'Toggle Panel Visibility',
    category: 'View',
    shortcut: 'Ctrl+`',
    handler: () => PanelService.toggleBottomPanel(),
  });

  CommandService.registerCommand({
    id: 'workbench.action.selectFiles',
    title: 'Select Files to Add...',
    category: 'File',
    handler: () => WorkspaceService.selectFiles(),
  });

  CommandService.registerCommand({
    id: 'workbench.action.selectDirectory',
    title: 'Select Directory to Open...',
    category: 'File',
    handler: () => WorkspaceService.selectDirectory(),
  });

  CommandService.registerCommand({
    id: 'workbench.action.clearHistory',
    title: 'Clear Recent Workspace History',
    category: 'Workspace',
    handler: () => WorkspaceService.clearHistory(),
  });

  CommandService.registerCommand({
    id: 'workbench.action.toggleSettings',
    title: 'Toggle Settings Panel',
    category: 'Preferences',
    shortcut: 'Ctrl+,',
    handler: () => useFileMonitorStore.getState().toggleSettingsPanel(),
  });

  CommandService.registerCommand({
    id: 'workbench.action.openCommandPalette',
    title: 'Show All Commands',
    category: 'View',
    shortcut: 'Ctrl+Shift+P',
    handler: () => OverlayService.openCommandPalette(),
  });

  CommandService.registerCommand({
    id: 'workbench.action.toggleTheme',
    title: 'Toggle Dark / Light Theme Mode',
    category: 'Preferences',
    handler: () => {
      const current = useFileMonitorStore.getState().themeMode;
      useFileMonitorStore.getState().setThemeMode(current === 'dark' ? 'light' : 'dark');
    },
  });

  // Track initial bootstrapping
  useDiagnosticsStore.getState().addEvent({
    category: 'system',
    severity: 'info',
    message: 'Workbench Services successfully initialized',
  });
};
