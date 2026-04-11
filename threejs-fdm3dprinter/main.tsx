import { createRoot } from 'react-dom/client'
import './style.css'
import App from './ui/App.tsx'

// Import and run printer initialization (scene bootstrap + model load).
// This creates the renderer/scene/camera but does NOT mount the canvas —
// App.tsx handles that via mountRenderer().
import './main-printer.js'

// Render React app
const container = document.getElementById('app')
if (container) {
  const root = createRoot(container)
  root.render(<App />)
}
