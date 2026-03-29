import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 2600,
        style: {
          background: 'rgba(16, 19, 26, 0.96)',
          color: '#eef2ff',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.34)',
        },
        success: {
          style: {
            background: 'rgba(51, 209, 122, 0.97)',
            color: '#062c17',
            border: '1px solid rgba(51, 209, 122, 0.55)',
          },
        },
        error: {
          style: {
            background: 'rgba(220, 68, 56, 0.97)',
            color: '#fff5f5',
            border: '1px solid rgba(220, 68, 56, 0.55)',
          },
        },
      }}
    />
  </React.StrictMode>,
);
