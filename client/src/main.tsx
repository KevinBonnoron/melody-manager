import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './index.css';
import { routeTree } from './routeTree.gen';

async function initializeApp() {
  const router = createRouter({ routeTree });

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Root element not found. Check if it's in your index.html or if the id is correct.");
  }

  // Render the app
  if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  }
}

initializeApp();
