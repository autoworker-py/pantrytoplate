import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/red-hat-display';
import '@fontsource-variable/red-hat-text';
import App from './App';
import { AuthProvider } from './lib/auth';
import './styles/base.css';
import './styles/screens.css';
import { registerServiceWorker } from './lib/notify';
import { setUpNative } from './lib/native';

void registerServiceWorker();
void setUpNative();

/* Night is the only theme for now; say so to the browser before first paint. */
document.documentElement.setAttribute('data-theme', 'dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
