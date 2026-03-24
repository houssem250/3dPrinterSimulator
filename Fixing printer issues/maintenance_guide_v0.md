In PrinterConfig:

    Axes > X&Y&Z > MAX_TRAVEL_MM : If I change value , what will happen , which object is related to those configs ?
    It seems the Axes[X,Y] and Bed[WIDTH_MM, DEPTH_MM] has relationship 
    If I change bed values , will axes max travel change ?

    PRINTING,
    DEFAULT_FEEDRATE_MM_MIN and DEFAULT_SPEED_MM_S ? Difference ? 
    DEFAULT_LAYER_HEIGHT_MM is changable depending on G-code
    So FEEDRATE, SPEED and LAYER_HEIGHT are mutable depending on G-code , also we have PrintingExamples that can use custom config
    DEFAULT_PLACEMENT : well it's good , I want to add another PRINTING metric, the position of center and the corner ? let's read whole project maybe we have those values in somewhere
    MIN_MOVE_DURATION_MS : prevents zero-duration frames, I wonder if that makes filament[mesh in three.js] be like clusters ? or it doens't affect on unity of mesh [instead of one block , it can cause mesh to be in clusters because of non-zero]
    HOME_DURATION_MS : I still I don't understand , also HOME_SETTLE_MS, what's the effect ?

    SCENE, It's not in my concerns for now but I can feature in the scene to add option of go down or above like in blender instead of just keeping with X&Y&Z , blender has hand icon
    ANIMATION > TIMELINE_STEP_MS, I have no idea 

model_constants:

    contains constants such : PART_NAMES, COLOR_OVERRIDES, MATERIAL_DEFAULTS

model_debugger:

    Dev tool part,
    printHierarchy, analyzeHierarchy, inspect(object), getPath, stats, getObjectsByType[mesh,group], setPosition, _walkTree, _deg

ModelLoader:
    import from model_constants PART_NAMES, COLOR_OVERRIDES, MATERIAL_DEFAULTS,
    builds THREE.Scene instance, _loader ... loadModel(url), findPartByName, 
    logBedDimensions[@returns {{ original: { width: number, depth: number }, scaled: { width: number, depth: number } } | null}]
        box.getSize(size);
    changeColor(s),
    _setupModel
        registration of (PART_NAMES)
        Physical Realism (castShadow & receiveShadow)
        Material Standardization
    _requireModel
    _applyColorToMesh
    _correctMaterialColor

BaseAxis
    import PRINTER_CONFIG
    constructor(printerModel, config = {})
        axisName, maxTravel, modelScale, screwPitch[efers to the vertical distance (usually in millimeters) that a component moves during one full 360-degree rotation of a lead screw.]
        urrentPosition = 0; // Current position in mm, always within [0, maxTravel]
        timeline = [];
        isAnimating = false;
        _animationFrame = null; // requestAnimationFrame handle for the active animation. 
    findPartByName // Delegates to the same pattern used by `ModelLoader.findPartByName()
    moveToPosition(position, duration = 0) // animates with ease-in/out
    setPosition(position)
    animateToPosition(targetPosition, duration) // Animates the axis from its current position to `targetPosition`
    setTimeline(keyframes) // @param {Array<{ position: number, time: number }>} keyframes
    playTimeline(), stopTimeline(), 
    home() //  axis back to position 0 (home)
    getPosition()
        return {
        min:        0,
        max:        this.maxTravel,
        current:    this.currentPosition,
        screwPitch: this.screwPitch,
        };
    updatePartsPosition() // hook
    _clamp(value) // Clamps `value` to [0, maxTravel]
        _clamp(value) {
        return Math.max(0, Math.min(value, this.maxTravel));
        }
    _easeInOut

XAxisMotion extends BaseAxis
    
    super(printerModel, {
      axisName:   'X',
      maxTravel:  MAX_TRAVEL_MM,
      modelScale,
      screwPitch: SCREW_PITCH_MM,
    });
    Parts used only for limit calculation: GalgenHorizontral, trapezoid_screwX000, RollenGondel
    _calculateLimits() : 
        // Computes `localMinX` and `localMaxX` from the physical roller positions.
        // Falls back to the rail extents if fewer than 2 end-stop rollers are found.
         _applyRailFallbackLimits(rollenHalfWidth), _applyRollerLimits(stopRollers, rollenHalfWidth), _convertWorldLimitsToLocal();
         _getCarriageRollerHalfWidth(), _collectEndStopRollers()

    xGroup

YAxisMotion extends BaseAxis

    super(printerModel, {
      axisName:   'Y',
      maxTravel:  MAX_TRAVEL_MM,
      modelScale,
      screwPitch: SCREW_PITCH_MM,
    });
    _resolveMovingParts();
    _calculateLimits();
    // Resolves the moving group (preferring `Y_axis`, falling back to `Tisch`)
    // and the two lead screws used for limit calculations.
    screws : trapezoid_screwY000, trapezoid_screwY001

    yGroup
    
ZAxisMotion extends BaseAxis

    constructor(modelLoader, printerModel, modelScale = 1) {
        super(printerModel, {
        axisName:   'Z',
        maxTravel:  MAX_TRAVEL_MM,
        modelScale,
        screwPitch: SCREW_PITCH_MM,
        });

        this.modelLoader = modelLoader;

        this._resolveMovingParts();
        this._calculatePhysicalLimits();
    }
    // Resolves the Z_axis group (preferred) or falls back to a list of
    // individual named parts that move together.
    _resolveMovingParts() 

    zGroup
    const partNames = [
        'GalgenHorizontral',
        'X_axis',
        'MotorHorizontal',
        'Extruder',
        'Feder',
        'Bolt003',
      ];
    screws : trapezoid_screwZ000, trapezoid_screwZ001

    /**
    * Calculates the usable Y-delta range from physical collision geometry.
    *
    * `maxDelta` — how far up the gantry can travel before Klammernvertikal
    *             hits the U_trapezoid001 ceiling.
    * `minDelta` — how far down before Nevelierungsschalter hits the bed.
    */
    _calculatePhysicalLimits()
        const ceiling = this.findPartByName('U_trapezoid001');
        const clamp   = this.findPartByName('Klammernvertikal');
        const bed     = this.findPartByName('Tisch');
        const sensor  = this.findPartByName('Nevelierungsschalter');

    /**
    * Maps `positionMm` → Y delta and moves the gantry group (or individual parts if the group wasn't found).
    *  positionMm  Already clamped by BaseAxis.setPosition().
    */
    updatePartsPosition(positionMm)


Axis,Class Name,Physical Motion,Three.js Mapping,Key Mechanical Logic
X,XAxisMotion,Left ↔ Right,Local X,"Moves the ""Carriage"" group. Limits are calculated by measuring distance between end-stop rollers."
Y,YAxisMotion,Forward ↔ Backward,World Z,"Moves the ""Bed"" (Tisch) assembly. Limits are derived from 80% of the lead screw's length."
Z,ZAxisMotion,Up ↔ Down,World Y,"Moves the ""Gantry"" vertically. Limits are based on physical collisions (e.g., the leveling switch hitting the bed)."

All three classes use updatePartsPosition(positionMm) to execute movement, but the internal math differs:
    X: this.xGroup.position.x = localX;
    Y: this._movingGroup.position.z = delta;
    Z: this.gantryGroup.position.y = delta;

The X-axis focuses on relative local movement. Because the X-carriage is a child of the Z-axis


PrintingMotion
    import PRINTER_CONFIG 
    const {
        DEFAULT_FEEDRATE_MM_MIN,
        DEFAULT_SPEED_MULTIPLIER,
        DEFAULT_PLACEMENT,
        MIN_MOVE_DURATION_MS,
        HOME_DURATION_MS,
        HOME_SETTLE_MS,
    } = PRINTER_CONFIG.PRINTING;

    <!-- Verify placement : center or corner -->

    /**
    * @params xAxis: XAxisMotion , yAxis: YAxisMotion, zAxis : ZAxisMotion
    * @param {object}  [options]
    * @param {'corner'|'center'} [options.placement='corner'] <<--
    *   G-code coordinate origin: 'corner' = front-left (slicer default),
    *   'center' = bed center.
    * @param {number}  [options.speedMultiplier=1]
    * @param {{ width: number, depth: number }} [options.bedDimensions]
    *   Override auto-detected bed size in mm.
    *   and more
   */
    loadMoves(moveList) - Loads a G-code-style move list, replacing any previous list
    loadCustomPath(moves) // Backward-compatible loader for raw `{ x, y, z, speed }` objects // Converts to G1 internally
    executePath() - Executes the loaded move list sequentially // Awaits each move's duration before proceeding to the next
        this.isRunning  = true;
        this._moveIndex = 0;
        this._offsetX   = 0;
        this._offsetY   = 0;
        this._offsetZ   = 0;
    // Clear previous filament and start fresh for this run
    this._filamentRenderer?.reset();
    if (cmd === 'G28') // home
        // Snap to exact home — eliminates rAF/setTimeout timing race
        // Break filament line so home doesn't connect to next print segment
    ── G92: Set virtual zero
    ── G0 / G1: Move
        ...
        // Snap to exact target position before reading nozzle world coords.
        // animateToPosition uses rAF; _delay uses setTimeout.
        // At high speedMultiplier, setTimeout fires before the final rAF tick —
        // the nozzle matrix is one frame stale, placing filament at the wrong spot.
        // setPosition() writes the exact transform instantly at no visual cost.
        // G0 travel — break the filament line so no connector is drawn
        ...
    stop()
     ── Live filament // Attaches a `FilamentRenderer` instance so live filament is drawn during `executePath()`.
    setFilamentRenderer(renderer)
    clearFilamentRenderer()
    getStatus()
    printStatus()
    ── Coordinate mapping
        mapX(gcodeX) {
            return Math.max(0, Math.min(
            (gcodeX / this.bedWidth) * this.xAxis.maxTravel,
            this.xAxis.maxTravel,
            ));
        }
        _mapX(gcodeX) .... for y and y also

    ── Private helpers
    _moveDuration
    _syncLegacyPath()
    _delay(ms)


GCodeLoader
    huge class
    * Supported G-code commands
    * ──────────────────────────
    *   G0 / G1    Rapid / print move
    *   G28        Home axes
    *   G90        Absolute positioning (default)
    *   G91        Relative positioning
    *   G92        Set position / reset extruder
    *   M82 / M83  Extruder absolute / relative  (accepted, ignored)
    *   M104 / M109  Hotend temperature  (recorded in stats)
    *   M140 / M190  Bed temperature     (recorded in stats)
    *   M106 / M107  Fan on/off          (recorded in stats)
    *   ;           Comment — stripped
    loadFromFile(file)
    summary()
    _parseParams(tokens)
    _emptyStats()
        totalLines:        0,
        parsedMoves:       0,
        skipped:           0,
        layers:            0,
        hotendTemp:        null,
        bedTemp:           null,
        estimatedFilament: 0,
    
path_generators
    Pure functions that build G-code-style move lists for common print shapes.
    generateSquarePath(), generateCirclePath(), tower()
        *  `generateSquarePath()` and `generateCirclePath()` were instance methods
        *  on `PrintingMotion`. They had no dependency on `this` state beyond
        *  calling `this.loadMoves()` at the end — making them methods was a
        *  violation of SRP and made them impossible to test or reuse without
        *  constructing a full `PrintingMotion` instance.
        *
        *  `tower()` was a method on `PrintingExamples` (dev-only) despite being a
        *  pure geometric computation with no dev-tool concerns.
        *
        *  All three are now stateless functions on a `PathGenerators` namespace
        *  object. They return a plain move-list array — callers pass that to
        *  `printer.loadMoves()` themselves.

those need simple explanation  
scene/environment
scene/lighting
scene/scene_setup

FilamentRenderer
    ...
    _findSceneNodes()
        uses Tisch and Druckkopf
        FilamentRenderer ready.  Bed top Y:
    ── Public API 
    reset()
    appendPoint()
    appendBreak()
    clear()

    ── Private helpers
    _readNozzleWorldPosition()
    _worldToTischLocal(world)
    _ensureGroup()
    _rebuildLastSegment() // Rebuilds only the last (active) segment's Line — earlier segments untouched.
    _destroyGroup()

    PathPreview
        show(path)
        clear()

main
    ── 1. Scene bootstrap
    ── 2. Lighting & environment
    ── 3. Load model
    ── 4a. Position model
    ── 4b. Initialise axes
    ── 4c. Initialise PrintingMotion
    ── 5. Dev tools
    ── 6. Render loop (animate)
    ── Private helpers
        _attachStressTestTimelines
