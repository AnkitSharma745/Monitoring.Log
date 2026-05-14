import { useEffect } from 'react';
import { usePlatformStore, type PlatformState } from './infrastructure/store';
import type React from 'react';

function App(): React.JSX.Element {
  const isConnected = usePlatformStore((state: PlatformState) => state.isConnected);
  const serverTimestamp = usePlatformStore((state: PlatformState) => state.serverTimestamp);
  const uptime = usePlatformStore((state: PlatformState) => state.uptime);
  const config = usePlatformStore((state: PlatformState) => state.config);
  const metrics = usePlatformStore((state: PlatformState) => state.metrics);

  const checkConnection = usePlatformStore((state: PlatformState) => state.checkConnection);
  const fetchConfiguration = usePlatformStore((state: PlatformState) => state.fetchConfiguration);
  const fetchMetrics = usePlatformStore((state: PlatformState) => state.fetchMetrics);

  useEffect(() => {
    // Perform automated execution loop verifying core architecture health
    checkConnection();
    fetchConfiguration();
    fetchMetrics();

    const interval = setInterval(() => {
      checkConnection();
      fetchMetrics();
    }, 5000);

    return () => clearInterval(interval);
  }, [checkConnection, fetchConfiguration, fetchMetrics]);

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '40px',
        maxWidth: '960px',
        margin: '0 auto',
        color: '#f1f5f9',
        backgroundColor: '#0b0f19',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid #1e293b',
          paddingBottom: '24px',
          marginBottom: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              PHASE 2 CORE
            </span>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              Monitoring.Log Platform
            </h1>
          </div>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px', marginBottom: 0 }}>
            Orchestration Runtime Layer & Strongly Typed IPC Foundation
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#111827',
            padding: '8px 16px',
            borderRadius: '20px',
            border: '1px solid #374151',
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10b981' : '#ef4444',
              boxShadow: isConnected ? '0 0 10px #10b981' : '0 0 10px #ef4444',
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: isConnected ? '#10b981' : '#ef4444',
            }}
          >
            {isConnected ? 'IPC SECURE' : 'BRIDGE DROPPED'}
          </span>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Environment Topology Card */}
        <div
          style={{
            backgroundColor: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#94a3b8',
              margin: '0 0 16px 0',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Topology Configuration</span>
            <code style={{ fontSize: '11px', color: '#10b981' }}>window.desktop.system</code>
          </h2>
          {config ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1f2937',
                  paddingBottom: '8px',
                }}
              >
                <span style={{ color: '#6b7280' }}>Target Env:</span>
                <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{config.environment}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1f2937',
                  paddingBottom: '8px',
                }}
              >
                <span style={{ color: '#6b7280' }}>Log Level Filter:</span>
                <span style={{ fontWeight: 500, color: '#f59e0b' }}>{config.logLevel}</span>
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}
              >
                <span style={{ color: '#6b7280' }}>Packaged Native:</span>
                <span style={{ fontWeight: 500, color: config.isPackaged ? '#10b981' : '#94a3b8' }}>
                  {config.isPackaged ? 'true' : 'false'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: '#6b7280', fontSize: '13px', fontStyle: 'italic' }}>
              Resolving runtime topology cache...
            </div>
          )}
        </div>

        {/* Hardware Resource Health Card */}
        <div
          style={{
            backgroundColor: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#94a3b8',
              margin: '0 0 16px 0',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Host Resource Health</span>
            <code style={{ fontSize: '11px', color: '#38bdf8' }}>window.desktop.diagnostics</code>
          </h2>
          {metrics ? (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1f2937',
                  paddingBottom: '8px',
                }}
              >
                <span style={{ color: '#6b7280' }}>Memory Utilization:</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                  {metrics.memoryUsage.toFixed(2)}%
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1f2937',
                  paddingBottom: '8px',
                }}
              >
                <span style={{ color: '#6b7280' }}>Compute Saturation:</span>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
                  {metrics.cpuUsage.toFixed(2)}%
                </span>
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}
              >
                <span style={{ color: '#6b7280' }}>Active Viewports:</span>
                <span style={{ fontWeight: 600, color: '#10b981' }}>
                  {metrics.activeWindowCount} singleton frames
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: '#6b7280', fontSize: '13px', fontStyle: 'italic' }}>
              Interrogating hardware metric sinks...
            </div>
          )}
        </div>

        {/* Operational Telemetry Hook Card */}
        <div
          style={{
            backgroundColor: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8', margin: '0 0 16px 0' }}>
            Runtime Telemetry & Heartbeat
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid #1f2937',
                paddingBottom: '8px',
              }}
            >
              <span style={{ color: '#6b7280' }}>Host Uptime:</span>
              <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{uptime ?? 0}s operational</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
              <span style={{ color: '#6b7280' }}>Last Ping Sync:</span>
              <code style={{ fontSize: '12px', color: '#64748b' }}>
                {serverTimestamp
                  ? new Date(serverTimestamp).toLocaleTimeString()
                  : 'Awaiting bridge response'}
              </code>
            </div>
          </div>
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px dashed #374151',
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            🔒 Memory-Safe Internal Event Bus Hooks Active
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
