const api = window.GCODE_STUDIO?.api || {};

export const {
  annotatePathHints,
  applyMeshTransform,
  arrayBufferFromB64,
  b64FromArrayBuffer,
  bedAlignMesh,
  buildFromImage,
  buildGcodeWithRules,
  buildMeshIndex,
  centerMesh,
  clamp,
  compileExpr,
  divider,
  dividerTiny,
  downloadText,
  drawMeshPreview2D,
  drawWireframe2D,
  elInput,
  elNumber,
  elSelect,
  elTextarea,
  elToggle,
  escapeHTML,
  field,
  fmt,
  genEquation,
  genFromSVG,
  genPolar,
  genSpiralVase,
  grid2,
  inferLayer,
  markDirtyAuto,
  meshRuntimeCache,
  meshTopZ,
  parseSTL,
  pickLayerHeight,
  rad,
  refreshNodeContent,
  renderSchema,
  rerenderNode,
  safeName,
  saveState,
  schedulePreviewUpdate,
  sliceMeshPlanar,
  stopGraphGestures,
  surfaceRasterPath,
  toast
} = api;

export const { NODE_DEFS } = window.GCODE_STUDIO;
export const SCHEMA_EXPORT = api.SCHEMA_EXPORT;
export const SCHEMA_IMPORT_MESH_V2 = api.SCHEMA_IMPORT_MESH_V2;
export const SCHEMA_MESH_PRIMITIVE = api.SCHEMA_MESH_PRIMITIVE;
export const SCHEMA_MESH_PRIMITIVE_V2 = api.SCHEMA_MESH_PRIMITIVE_V2;
export const SCHEMA_NOTE = api.SCHEMA_NOTE;
export const SCHEMA_PRINTER = api.SCHEMA_PRINTER;
export const SCHEMA_RULES = api.SCHEMA_RULES;
export const SCHEMA_SLICER_V2 = api.SCHEMA_SLICER_V2;
export const SCHEMA_SLICER_QUALITY = api.SCHEMA_SLICER_QUALITY;
export const SCHEMA_SLICER_WALLS = api.SCHEMA_SLICER_WALLS;
export const SCHEMA_SLICER_INFILL = api.SCHEMA_SLICER_INFILL;
export const SCHEMA_SLICER_TOP_BOTTOM = api.SCHEMA_SLICER_TOP_BOTTOM;
export const SCHEMA_SLICER_SKIRT_BRIM = api.SCHEMA_SLICER_SKIRT_BRIM;
export const SCHEMA_SLICER_SPEEDS_FLOW = api.SCHEMA_SLICER_SPEEDS_FLOW;
export const SCHEMA_SLICER_RETRACTION_TRAVEL = api.SCHEMA_SLICER_RETRACTION_TRAVEL;
export const SCHEMA_SLICER_COOLING = api.SCHEMA_SLICER_COOLING;
export const SCHEMA_SLICER_LIMITS = api.SCHEMA_SLICER_LIMITS;
export const SCHEMA_SLICER_SURFACE_RASTER = api.SCHEMA_SLICER_SURFACE_RASTER;
export const studioDock = api.studioDock;
