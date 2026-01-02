import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Printer',
  def: {
    title:"Printer", tag:"machine",
    uiSchema:SCHEMA_PRINTER,
  desc:"Bed, origin, filament, line width, start/end G-code.",
    inputs: [], outputs:[{name:"profile", type:"profile"}],
    initData: ()=>({
      name:"Generic FDM",
      bedW:220, bedD:220, bedH:250,
      origin:"center",
      offsetX:0, offsetY:0,
      travelZ:5,
      nozzle:0.4,
      lineWidth:0.45,
      filamentDia:1.75,
      extrusionMult:1.0,
      tempNozzle:210,
      tempBed:60,
      speedPrint:1800,
      speedTravel:6000,
      startGcode:`M104 S210
M140 S60
G28
G92 E0`,
      endGcode:`M104 S0
M140 S0
G28 X0
M84`
    }),
    render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
    evaluate:(node)=>({ profile: {...node.data} })
  }
};
