import { SCHEMA_SLICER_WALLS, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  perimeters:2,
  spiralVase:false,
  seamMode:"nearest",
  wallOrdering:"inner>outer",
  gapFill:false,
  wallOverlap:15
};

export default {
  type: 'Slicer Walls',
  def: {
    title:"Slicer Walls",
    defaultW:300,
    defaultH:280,
    tag:"slicer",
    desc:"Wall/shell configuration for planar slicing.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_WALLS, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
