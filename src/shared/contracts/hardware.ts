export type HardwareComponentKind =
  | 'printer'
  | 'scanner'
  | 'cardReader'
  | 'cashAcceptor'
  | 'dispenser'
  | 'network'
  | 'storage'
  | 'display'
  | 'unknown';

export type HardwareState = 'online' | 'offline' | 'degraded' | 'initializing' | 'unknown';

export interface HardwareComponent {
  id: string;
  kind: HardwareComponentKind;
  name: string;
  model: string | null;
  firmwareVersion: string | null;
}

export interface HardwareStateSnapshot {
  id: string;
  kioskId: string;
  componentId: string;
  state: HardwareState;
  observedAt: string;
  evidenceEntryIds: string[];
}

export interface HardwareContext {
  kioskId: string;
  components: HardwareComponent[];
  states: HardwareStateSnapshot[];
}
