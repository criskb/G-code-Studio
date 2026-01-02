import { SCHEMA_SLICER_SURFACE_RASTER, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  spacing:1.0,
  step:0.6,
  angleDeg:0,
  margin:0,
  surfaceSerp:true,
  cellSize:0,
  maxPts:0
};

export default {
  type: 'Slicer Surface Raster',
  def: {
    title:"Slicer Surface Raster",
    defaultW:320,
    defaultH:240,
    tag:"slicer",
    desc:"Non-planar surface raster settings.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_SURFACE_RASTER, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
