import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { wagmiConfig } from '@/lib/appkit';
import { WagmiProvider } from 'wagmi';

import './index.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <WagmiProvider config={wagmiConfig} reconnectOnMount>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </WagmiProvider>,
);
