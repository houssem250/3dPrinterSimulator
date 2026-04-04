import { useEffect, useRef, useState } from 'react'
import { Button } from './components/ui/button'

declare global {
  interface Window {
    app?: any; // Three.js app context
  }
}

function App() {
  const threeContainerRef = useRef<HTMLDivElement>(null)
  const [isCanvasVisible] = useState(true)

  useEffect(() => {
    if (threeContainerRef.current && window.app?.renderer?.domElement) {
      threeContainerRef.current.appendChild(window.app.renderer.domElement)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="w-full border-b bg-card p-3 shadow-sm">
        <div className="container mx-auto flex items-center justify-between px-4">
          <h1 className="text-2xl font-bold">3D Printer Simulator</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">Settings</Button>
            <Button variant="outline" size="sm">Help</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 container mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        <aside className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="mb-3 font-semibold">Sidebar</p>
          <ul className="space-y-2 text-sm">
            <li className="rounded px-2 py-1 hover:bg-accent/20">Printer Status</li>
            <li className="rounded px-2 py-1 hover:bg-accent/20">Job Queue</li>
            <li className="rounded px-2 py-1 hover:bg-accent/20">Material</li>
            <li className="rounded px-2 py-1 hover:bg-accent/20">Maintenance</li>
          </ul>
        </aside>

        <section className="flex flex-col gap-4">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">Top bar</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm">Start</Button>
              <Button size="sm" variant="outline">Pause</Button>
              <Button size="sm" variant="destructive">Stop</Button>
            </div>
          </div>

          <div className="flex-1 rounded-lg border bg-card p-4 shadow-sm">
            {isCanvasVisible ? (
              <div ref={threeContainerRef} className="h-[500px] w-full bg-gray-950 rounded-lg overflow-hidden">
                {!window.app?.renderer && <p className="text-gray-400 text-center pt-24">Loading 3D Printer...</p>}
              </div>
            ) : (
              <div className="h-[500px] w-full flex items-center justify-center rounded-lg border border-dashed border-muted">
                <p className="text-muted-foreground">Canvas hidden by boolean mode.</p>
              </div>
            )}
          </div>

          <footer className="rounded-lg border bg-card p-3 text-sm text-muted-foreground shadow-sm">
            Bottom bar: quick status and action hints.
          </footer>
        </section>
      </div>
    </div>
  )
}

export default App