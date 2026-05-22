import { createRoot } from 'react-dom/client';
import { initializeWorkbench } from '@renderer/services/workbenchServices';
import App from './App';
import './styles.css';

// Bootstrap the workbench sidepanel and status bar registries statically
initializeWorkbench();

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
