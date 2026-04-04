# Copilot Instructions for threejs-fdm3dprinter

## 1. Repository overview
- This is a Three.js-based FDM 3D printer simulation project with React frontend.
- Root folder: `threejs-fdm3dprinter`.
- Uses Vite as the dev server/build tool with React plugin.
- Entry point: `index.html`, main script: `main.tsx` (renders React app), `main-printer.js` (Three.js printer simulation).
- UI code: `ui/` folder with React components, Tailwind CSS, and Shadcn/ui.
- TypeScript: Full TypeScript support with `tsconfig.json` for type safety (strict mode enabled).
- Core simulation: `printer_manager/`, `scene/`, `visualization/`, `model/`, `gcode/` folders.
- Essential features:
  - 3D printer visualization and motion via `printer_manager/`.
  - G-code parsing/generation in `gcode/`.
  - Scene/lighting in `scene/`.
  - Filament rendering in `visualization/`.
  - React UI with controls in `ui/App.tsx` (includes canvas visibility controlled by boolean state).

## 2. Build and run commands
- Install dependencies: `npm install`.
- Run development server: `npm run dev` (serves at http://localhost:5174/).
- Build production assets: `npm run build`.
- Preview built site: `npm run preview`.

## 3. Agent guidance
- When modifying rendering/scene state, prefer non-blocking updates and avoid synchronous heavy loops in the main thread.
- Keep physics/motion state in `printer_manager/motion`; visualization should be driven by that model.
- Keep resources in `config/` and avoid hardcoded constants in multiple places.
- For new React components, use the Shadcn/ui components from `ui/components/ui/`.
- Use Tailwind classes for styling; CSS variables are defined in `style.css`.
- For new features, preserve existing ES module style and `import` usage.

## 4. Todo and conventions
- Use 2-space indentation to match existing files.
- Use descriptive names for scene objects and motion controls.
- Prefer clear file/module layering: `model/*`, `gcode/*`, `printer_manager/*`, `scene/*`, `visualization/*`, `ui/*`.
- React components: PascalCase, hooks for state management, TypeScript interfaces for props.
- Tailwind: utility-first approach, responsive design with `md:`, `lg:` prefixes.

## 5. Suggested first tasks
- Add a README with project description and basic usage.
- Validate existing `gcode/gcode_loader.js` path parsing and add tests if appropriate.
- Improve debug tooling in `model/model_debugger.js`.
- Integrate React controls with Three.js printer actions (e.g., connect buttons to `window.app.printer`).

## 6. Example prompts
- "Help me add a filament extrusion preview mode in `visualization/filament_renderer.js` that toggles between solid and wireframe rendering."
- "Find and fix the performance bottleneck when loading large G-code files in `gcode/gcode_loader.js`."
- "Refactor `printer_manager/motion/printing_motion.js` to separate trajectory planning and actuator updates."
- "Add a new Shadcn button in `ui/App.tsx` to control printer pause/resume."
