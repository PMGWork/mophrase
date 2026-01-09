import { createRoot } from 'react-dom/client';
import { App } from './app';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element (#root) が見つかりません。');
}

createRoot(container).render(<App />);
