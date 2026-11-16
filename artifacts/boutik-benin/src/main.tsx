import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

async function startApp() {
  if (import.meta.env.DEV) {
    const { demoWorker } = await import('./demo/worker');
    await demoWorker.start({
      onUnhandledFrame: 'bypass',
      serviceWorker: {
        url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
      },
    });
  }

  createRoot(document.getElementById('root')!, {
    // Keeps caught errors off reportError(), which would raise the dev overlay.
    onCaughtError: (error, errorInfo) => {
      console.error(error, errorInfo.componentStack);
    },
  }).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

void startApp();
