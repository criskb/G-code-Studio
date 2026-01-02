import { SCHEMA_SLICER_TOP_BOTTOM, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  topLayers:4,
  bottomLayers:4,
  solidPattern:"",
  ironing:false,
  skinOverlap:15,
  monotonic:false
};

export default {
  type: 'Slicer Top/Bottom',
  def: {
    title:"Slicer Top/Bottom",
    defaultW:320,
    defaultH:280,
    tag:"slicer",
    desc:"Top and bottom skin settings.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_TOP_BOTTOM, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
