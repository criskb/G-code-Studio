import { SCHEMA_SLICER_LIMITS, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  maxLayers:0,
  maxSegs:0
};

export default {
  type: 'Slicer Limits',
  def: {
    title:"Slicer Limits",
    defaultW:240,
    defaultH:180,
    tag:"slicer",
    desc:"Advanced safety limits for planar slicing.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_LIMITS, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
