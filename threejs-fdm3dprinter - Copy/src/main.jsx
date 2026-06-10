import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import '../style.css';

/**
 * React Entry Point
 * Mounts the Farm Dashboard.
 */
ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
