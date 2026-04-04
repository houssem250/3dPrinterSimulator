import { createRoot } from 'react-dom/client'
import App from './ui/App.tsx'

// Import and run printer initialization
import './main-printer.js'

// Render React app
const container = document.getElementById('app')
if (container) {
  const root = createRoot(container)
  root.render(<App />)
}
