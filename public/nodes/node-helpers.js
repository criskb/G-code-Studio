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
export const SCHEMA_IMPORT_MESH_V2 = api.SCHEMA_IMPORT_MESH_V2;
export const SCHEMA_MESH_PRIMITIVE = api.SCHEMA_MESH_PRIMITIVE;
export const SCHEMA_MESH_PRIMITIVE_V2 = api.SCHEMA_MESH_PRIMITIVE_V2;
export const SCHEMA_SLICER_V2 = api.SCHEMA_SLICER_V2;
export const studioDock = api.studioDock;
