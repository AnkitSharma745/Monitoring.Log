import { useState } from 'react';
import type { JSX } from 'react';

function App(): JSX.Element {
  const [message, setMessage] = useState('');

  const handleLog = (level: string): void => {
    if (!message) return;
    // @ts-ignore (exposed via preload)
    window.api.log(level, message, 'App.tsx', { source: 'Renderer' });
    setMessage('');
  };

  return (
    <div
      style={{
        padding: '40px',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
        background: '#f4f4f9',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '30px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '500px',
        }}
      >
        <h1 style={{ margin: '0 0 20px 0', color: '#333', fontSize: '24px' }}>Log Monitor</h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Type a message below to test the centralized logging system.
        </p>

        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened?..."
            style={{
              padding: '12px',
              width: '100%',
              borderRadius: '6px',
              border: '1px solid #ddd',
              fontSize: '16px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => handleLog('info')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '6px',
              border: 'none',
              background: '#3498db',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Info
          </button>
          <button
            onClick={() => handleLog('warn')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '6px',
              border: 'none',
              background: '#f39c12',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Warn
          </button>
          <button
            onClick={() => handleLog('error')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '6px',
              border: 'none',
              background: '#e74c3c',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Error
          </button>
        </div>
      </div>
      <div style={{ marginTop: '20px', color: '#888', fontSize: '12px' }}>
        Logs will be saved to C:/Filuet/Monitoring_Logs
      </div>
    </div>
  );
}

export default App;
