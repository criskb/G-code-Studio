import { SCHEMA_SLICER_QUALITY, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  layerHeight:0.2,
  firstLayerHeight:0.24,
  lineWidth:0.45,
  firstLayerLineWidth:0.50,
  elephantFootComp:0.0,
  detectThinWalls:false
};

export default {
  type: 'Slicer Quality',
  def: {
    title:"Slicer Quality",
    defaultW:300,
    defaultH:260,
    tag:"slicer",
    desc:"Quality-related slicing settings (layer height, line width).",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_QUALITY, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
