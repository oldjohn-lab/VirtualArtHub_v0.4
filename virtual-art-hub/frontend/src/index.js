import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

if (typeof window !== 'undefined') {
  const resizeObserverMessage = (e) => {
    const direct = e?.message ? String(e.message) : '';
    const nested = e?.error?.message ? String(e.error.message) : '';
    return direct || nested;
  };

  const isResizeObserverLoopError = (message) => {
    if (!message) return false;
    return (
      message.includes('ResizeObserver loop limit exceeded') ||
      message.includes('ResizeObserver loop completed with undelivered notifications')
    );
  };

  window.addEventListener('error', (e) => {
    const message = resizeObserverMessage(e);
    if (isResizeObserverLoopError(message)) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      e.stopImmediatePropagation();
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    const message = e?.reason?.message ? String(e.reason.message) : e?.reason ? String(e.reason) : '';
    if (isResizeObserverLoopError(message)) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
  });

  if (window.ResizeObserver) {
    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class ResizeObserver extends NativeResizeObserver {
      constructor(callback) {
        super((entries, observer) => {
          window.requestAnimationFrame(() => callback(entries, observer));
        });
      }
    };
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
