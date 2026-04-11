import { useEffect, useRef } from 'react'
import { Button } from './components/ui/button'
import { AppContext } from '../app_context.js'
import { mountRenderer } from '../scene/scene_setup.js'

import '../style.css'

function App() {
  const threeContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = threeContainerRef.current
    const renderer = AppContext.renderer
    const camera = AppContext.camera

    if (!container || !renderer || !camera) return

    // Mount the Three.js canvas into this React-managed container.
    mountRenderer(renderer, camera, container)

    return () => {
      // Cleanup: disconnect ResizeObserver and detach the canvas.
      if ((renderer as any).__resizeObserver) {
        (renderer as any).__resizeObserver.disconnect()
      }
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <header className="w-full border-b bg-card p-3 shadow-sm z-10">
        <div className="flex items-center justify-between px-4">
          <h1 className="text-xl font-bold">3D Printer Simulator</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">Settings</Button>
            <Button variant="outline" size="sm">Help</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[auto_1fr] overflow-hidden">
        <aside className="border-r bg-card p-4 w-fit">
          <p className="mb-3 font-semibold text-sm">Sidebar</p>
          <ul className="space-y-2 text-sm">
            <li className="rounded px-2 py-1 hover:bg-accent/20 cursor-pointer">Printer Status</li>
            <li className="rounded px-2 py-1 hover:bg-accent/20 cursor-pointer">Job Queue</li>
            <li className="rounded px-2 py-1 hover:bg-accent/20 cursor-pointer">Material</li>
            <li className="rounded px-2 py-1 hover:bg-accent/20 cursor-pointer">Maintenance</li>
          </ul>
        </aside>

        <section className="relative flex flex-col overflow-hidden">
          {/* Three.js canvas container — mountRenderer() handles everything */}
          <div
            ref={threeContainerRef}
            className="flex-1 bg-gray-950"
          />
        </section>
      </div>

      <footer className="w-full border-t bg-card py-2 px-4 text-xs text-muted-foreground shadow-sm z-10">
        Bottom bar: quick status and action hints.
      </footer>
    </div>
  )
}

export default App