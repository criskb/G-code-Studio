// Auto-extracted schema constants for node definitions.
const SCHEMA_IMPORT_MESH_V2 = [
  {key:"bedAlign", label:"Bed align (minZ→0)", ui:"toggle"},
  {key:"centerXY", label:"Center XY", ui:"toggle"},
  {key:"scale", label:"Scale", ui:"number", min:0.01, max:100, step:0.01},
  {key:"rxDeg", label:"Rot X°", ui:"number", min:-180, max:180, step:1},
  {key:"ryDeg", label:"Rot Y°", ui:"number", min:-180, max:180, step:1},
  {key:"rzDeg", label:"Rot Z°", ui:"number", min:-180, max:180, step:1},
  {key:"tx", label:"Offset X", ui:"number", min:-9999, max:9999, step:0.1},
  {key:"ty", label:"Offset Y", ui:"number", min:-9999, max:9999, step:0.1},
  {key:"tz", label:"Offset Z", ui:"number", min:-9999, max:9999, step:0.1},
];

const SCHEMA_MESH_PRIMITIVE_V2 = [
  {key:"size", label:"Size (mm)", ui:"number", min:5, max:600, step:1},
  {key:"height", label:"Height (mm)", ui:"number", min:0.1, max:600, step:1},
  {key:"seg", label:"Segments", ui:"number", min:8, max:240, step:1},
  {key:"waveAmp", label:"Wave amp", ui:"number", min:0, max:80, step:0.5, when:(d)=>d.kind==="wavy"},
  {key:"waveFreq", label:"Wave freq", ui:"number", min:0.1, max:20, step:0.1, when:(d)=>d.kind==="wavy"},
  {key:"bedAlign", label:"Bed align (minZ→0)", ui:"toggle"},
];

const SCHEMA_SLICER_V2 = [
  { kind:"group", title:"Input & Mode", rows:[
    { items:[
      {key:"bedAlign", label:"Bed align mesh", ui:"toggle", default:true},
      {key:"mode", label:"Mode", ui:"select", options:[
        ["planar","Planar (layers + shells + infill + top/bottom)"],
        ["surface","Surface raster (non-planar)"]
      ], default:"planar"},
    ]},
    { items:[
      {key:"originMode", label:"Origin", ui:"select", options:[
        ["from_printer","Use Printer origin"],
        ["center","Center on bed"],
        ["lowerleft","Lower-left on bed"]
      ], default:"from_printer"},
      {key:"scale", label:"Scale", ui:"number", min:0.01, max:100, step:0.01, default:1},
    ]},
    { items:[
      {key:"rotZ", label:"Rotate Z°", ui:"number", min:-180, max:180, step:1, default:0},
      {key:"zOffset", label:"Z offset", ui:"number", min:-50, max:50, step:0.01, default:0},
    ]},
  ], note:"<span class='hint'>Connect slicer category nodes (Quality, Walls, Infill, Top/Bottom, etc.) to feed settings into this slicer.</span>" },
];

const SCHEMA_SLICER_QUALITY = [
  { kind:"group", title:"Quality", rows:[
    { items:[
      {key:"layerHeight", label:"Layer height", ui:"number", min:0.05, max:1.2, step:0.01, default:0.2},
      {key:"firstLayerHeight", label:"First layer height", ui:"number", min:0.05, max:1.2, step:0.01, default:0.24},
    ]},
    { items:[
      {key:"lineWidth", label:"Line width", ui:"number", min:0.2, max:1.2, step:0.01, default:0.45},
      {key:"firstLayerLineWidth", label:"First layer line width", ui:"number", min:0.2, max:1.6, step:0.01, default:0.50},
    ]},
    { items:[
      {key:"elephantFootComp", label:"Elephant foot comp", ui:"number", min:0, max:1.0, step:0.01, default:0.0},
      {key:"detectThinWalls", label:"Detect thin walls (UI)", ui:"toggle", default:false},
    ]},
  ]},
];

const SCHEMA_SLICER_WALLS = [
  { kind:"group", title:"Shells (Walls)", rows:[
    { items:[
      {key:"perimeters", label:"Perimeters", ui:"number", min:0, max:12, step:1, default:2},
      {key:"spiralVase", label:"Spiral vase (UI)", ui:"toggle", default:false},
    ]},
    { items:[
      {key:"seamMode", label:"Seam (UI)", ui:"select", options:[
        ["nearest","Nearest"],["rear","Rear"],["random","Random"],["aligned","Aligned (UI)"]
      ], default:"nearest"},
      {key:"wallOrdering", label:"Wall ordering (UI)", ui:"select", options:[
        ["inner>outer","Inner → Outer"],["outer>inner","Outer → Inner (UI)"]
      ], default:"inner>outer"},
    ]},
    { items:[
      {key:"gapFill", label:"Gap fill (UI)", ui:"toggle", default:false},
      {key:"wallOverlap", label:"Infill overlap % (UI)", ui:"number", min:0, max:50, step:1, default:15},
    ]},
  ]},
];

const SCHEMA_SLICER_INFILL = [
  { kind:"group", title:"Infill", rows:[
    { items:[
      {key:"infillPct", label:"Infill %", ui:"number", min:0, max:100, step:1, default:15},
      {key:"infillPattern", label:"Pattern", ui:"select", options:[
        ["lines","Lines"],["zigzag","Zigzag"],["rectilinear","Rectilinear"],
        ["cross","Cross"],["grid","Grid"],
        ["triangles","Triangles"],["octagrid","Octagrid"],
        ["honeycomb","Honeycomb (approx)"],
        ["waves","Waves"],["gyroid2d","Gyroid-like (2D)"],
        ["cubic","Cubic (alt)"],
        ["concentric","Concentric"]
      ], default:"grid"},
    ]},
    { items:[
      {key:"infillAngle", label:"Angle°", ui:"number", min:0, max:180, step:1, default:45},
      {key:"serpentine", label:"Serpentine", ui:"toggle", default:true},
    ]},
    { items:[
      {key:"brickLayer", label:"Brick-layer (phase shift)", ui:"toggle", default:false},
      {key:"infillLineWidth", label:"Infill line width (UI)", ui:"number", min:0.2, max:2.0, step:0.01, default:0},
    ]},
  ]},
];

const SCHEMA_SLICER_TOP_BOTTOM = [
  { kind:"group", title:"Top & Bottom (Skins)", rows:[
    { items:[
      {key:"topLayers", label:"Top layers", ui:"number", min:0, max:60, step:1, default:4},
      {key:"bottomLayers", label:"Bottom layers", ui:"number", min:0, max:60, step:1, default:4},
    ]},
    { items:[
      {key:"solidPattern", label:"Skin pattern", ui:"select", options:[
        ["","(same as infill)"],["lines","Lines"],["zigzag","Zigzag"],["grid","Grid"],["concentric","Concentric"],
        ["waves","Waves"],["gyroid2d","Gyroid-like (2D)"]
      ], default:""},
      {key:"ironing", label:"Ironing (UI)", ui:"toggle", default:false},
    ]},
    { items:[
      {key:"skinOverlap", label:"Skin overlap % (UI)", ui:"number", min:0, max:50, step:1, default:15},
      {key:"monotonic", label:"Monotonic (UI)", ui:"toggle", default:false},
    ]},
  ]},
];

const SCHEMA_SLICER_SKIRT_BRIM = [
  { kind:"group", title:"Skirt / Brim", rows:[
    { items:[
      {key:"skirtLines", label:"Skirt lines", ui:"number", min:0, max:20, step:1, default:0},
      {key:"skirtDistance", label:"Skirt distance", ui:"number", min:0, max:50, step:0.5, default:6},
    ]},
    { items:[
      {key:"brimWidth", label:"Brim width", ui:"number", min:0, max:50, step:0.5, default:0},
      {key:"brimLines", label:"Brim lines (UI)", ui:"number", min:0, max:50, step:1, default:0},
    ]},
  ], note:"Skirt/Brim are generated as simple offset rings on the first layer (approximation)." },
];

const SCHEMA_SLICER_SPEEDS_FLOW = [
  { kind:"group", title:"Speeds & Flow", rows:[
    { items:[
      {key:"firstLayerSpeed", label:"First layer speed", ui:"number", min:60, max:12000, step:10, default:900},
      {key:"travelSpeed", label:"Travel speed", ui:"number", min:300, max:30000, step:10, default:6000},
    ]},
    { items:[
      {key:"wallSpeed", label:"Wall speed", ui:"number", min:60, max:30000, step:10, default:1800},
      {key:"infillSpeed", label:"Infill speed", ui:"number", min:60, max:30000, step:10, default:2400},
    ]},
    { items:[
      {key:"topSpeed", label:"Top speed", ui:"number", min:60, max:30000, step:10, default:1500},
      {key:"bottomSpeed", label:"Bottom speed", ui:"number", min:60, max:30000, step:10, default:1200},
    ]},
    { items:[
      {key:"wallFlow", label:"Wall flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
      {key:"infillFlow", label:"Infill flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
    ]},
    { items:[
      {key:"topFlow", label:"Top flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
      {key:"bottomFlow", label:"Bottom flow", ui:"number", min:0.1, max:2.0, step:0.01, default:1.0},
    ]},
  ], note:"These map into G-code defaults by <b>role</b> when no Rules node overrides speed/flow." },
];

const SCHEMA_SLICER_RETRACTION_TRAVEL = [
  { kind:"group", title:"Retraction & Travel", rows:[
    { items:[
      {key:"retract", label:"Retract length", ui:"number", min:0, max:20, step:0.01, default:0.8},
      {key:"retractSpeed", label:"Retract speed", ui:"number", min:60, max:30000, step:10, default:1800},
    ]},
    { items:[
      {key:"retractMinTravel", label:"Min travel for retract", ui:"number", min:0, max:50, step:0.1, default:1.0},
      {key:"zHop", label:"Z hop", ui:"number", min:0, max:10, step:0.01, default:0},
    ]},
    { items:[
      {key:"wipe", label:"Wipe (UI)", ui:"toggle", default:false},
      {key:"coast", label:"Coast (UI)", ui:"toggle", default:false},
    ]},
  ], note:"Retract/Z-hop are applied on travels in exported G-code (simple implementation)." },
];

const SCHEMA_SLICER_COOLING = [
  { kind:"group", title:"Cooling (UI)", rows:[
    { items:[
      {key:"fanFirstLayer", label:"Fan first layer %", ui:"number", min:0, max:100, step:1, default:0},
      {key:"fanOtherLayers", label:"Fan other layers %", ui:"number", min:0, max:100, step:1, default:100},
    ]},
    { items:[
      {key:"minLayerTime", label:"Min layer time (UI)", ui:"number", min:0, max:120, step:1, default:0},
      {key:"slowDownBelow", label:"Slow down below (UI)", ui:"number", min:0, max:60, step:1, default:0},
    ]},
  ]},
];

const SCHEMA_SLICER_LIMITS = [
  { kind:"group", title:"Advanced limits", rows:[
    { items:[
      {key:"maxLayers", label:"Max layers (limit)", ui:"number", min:0, max:99999, step:1, default:0},
      {key:"maxSegs", label:"Max segments/layer (limit)", ui:"number", min:0, max:9999999, step:100, default:0},
    ]},
  ]},
];

const SCHEMA_SLICER_SURFACE_RASTER = [
  { kind:"group", title:"Surface raster", rows:[
    { items:[
      {key:"spacing", label:"Raster spacing", ui:"number", min:0.1, max:10, step:0.05, default:1.0},
      {key:"step", label:"Sample step", ui:"number", min:0.05, max:5, step:0.05, default:0.6},
    ]},
    { items:[
      {key:"angleDeg", label:"Angle°", ui:"number", min:-180, max:180, step:1, default:0},
      {key:"margin", label:"Margin", ui:"number", min:0, max:50, step:0.1, default:0},
    ]},
    { items:[
      {key:"surfaceSerp", label:"Serpentine raster", ui:"toggle", default:true},
      {key:"cellSize", label:"Index cell (auto=0)", ui:"number", min:0, max:200, step:0.1, default:0},
      {key:"maxPts", label:"Max points (limit)", ui:"number", min:0, max:2000000, step:1000, default:0},
    ]},
  ]},
];

const DEFAULT_SLICER_SETTINGS = {
  layerHeight:0.2, firstLayerHeight:0.24, lineWidth:0.45, firstLayerLineWidth:0.50,
  elephantFootComp:0.0, detectThinWalls:false,
  perimeters:2, spiralVase:false, seamMode:"nearest", wallOrdering:"inner>outer", gapFill:false, wallOverlap:15,
  infillPct:15, infillPattern:"grid", infillAngle:45, serpentine:true, brickLayer:false, infillLineWidth:0,
  topLayers:4, bottomLayers:4, solidPattern:"", ironing:false, skinOverlap:15, monotonic:false,
  skirtLines:0, skirtDistance:6, brimWidth:0, brimLines:0,
  firstLayerSpeed:900, travelSpeed:6000, wallSpeed:1800, infillSpeed:2400, topSpeed:1500, bottomSpeed:1200,
  wallFlow:1.0, infillFlow:1.0, topFlow:1.0, bottomFlow:1.0,
  retract:0.8, retractSpeed:1800, retractMinTravel:1.0, zHop:0, wipe:false, coast:false,
  fanFirstLayer:0, fanOtherLayers:100, minLayerTime:0, slowDownBelow:0,
  maxLayers:0, maxSegs:0,
  spacing:1.0, step:0.6, angleDeg:0, margin:0, surfaceSerp:true, cellSize:0, maxPts:0
};
