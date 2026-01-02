import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, SCHEMA_SLICER_CATEGORIES, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

const DEFAULT_SLICER_CATEGORIES = {
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

export default {
  type: 'Slicer Categories',
  def: {
    title:"Slicer Categories",
    defaultW:360,
    defaultH:620,
    tag:"slicer",
    desc:"Category settings for the Slicer (quality, shells, infill, speeds, surface raster).",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({
      ...DEFAULT_SLICER_CATEGORIES
    }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_CATEGORIES, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
