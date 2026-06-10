# Global `app` Object Commands

## Date 29/03/2026 Time 10:59 PM

## How to Use

Everything is accessible through the global `app` object (exposed via `window.app`). These commands can be run directly in your browser console.

## Print Examples

| Command                                         | Description                                    |
|-------------------------------------------------|-----------------------------------------------|
| `app.examples.square(startX, startY, size, layers)`   | Prints a square at the specified position with given size and layers |
| `app.examples.circle(cx, cy, radius, layers)`       | Prints a circle at the specified center with given radius and layers |
| `app.examples.tower(cx, cy, size, layers, height, speed)` | Prints a calibration tower                  |
| `app.examples.fromURL('path/to/file.gcode')`        | Loads external G-code                        |
| `app.examples.pause()`                            | Pauses the current print                     |
| `app.examples.resume()`                           | Resumes a paused print                       |
| `app.examples.stop()`                             | Stops the current print                      |
| `app.examples.abort()`                            | Alias for stop()                             |
| `app.examples.reset()`                            | Stops, Clears bed, and Home axes             |
| `app.examples.clear()`                            | Removes all printed filament lines           |

## Live Tuning (Settings)

| Command                        | Description                                    |
|--------------------------------|-----------------------------------------------|
| `app.examples.speed(5)`         | Runs simulation at 5x speed                   |
| `app.examples.placement('center')` | Toggle origin placement between 'center' or 'corner' |
| `app.filament.setHeight(0.3)`  | Change layer height live                       |
| `app.filament.setWidth(0.6)`   | Change extrusion width live                    |
| `app.config`                    | View or edit hardware limits and defaults     |

## Manual Axis Control

| Command                             | Description                    |
|-------------------------------------|--------------------------------|
| `app.xAxis.moveToPosition(100, 1000)` | Move X axis to 100mm over 1000ms |
| `app.yAxis.moveToPosition(-100, 1000)` | Move Y axis (bed)              |
| `app.zAxis.moveToPosition(50, 1000)`   | Move Z axis (nozzle)           |

## Debugging Tools

| Command                         | Description                          |
|---------------------------------|--------------------------------------|
| `app.examples.where()`           | Logs world-space coordinates of nozzle and bed |
| `app.examples.dbg.inspect('X_axis')` | Highlights a specific GLB part       |
| `app.examples.dbg.stats()`      | Logs vertex and memory statistics     |