import { SCHEMA_SLICER_INFILL, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  infillPct:15,
  infillPattern:"grid",
  infillAngle:45,
  serpentine:true,
  brickLayer:false,
  infillLineWidth:0
};

export default {
  type: 'Slicer Infill',
  def: {
    title:"Slicer Infill",
    defaultW:320,
    defaultH:280,
    tag:"slicer",
    desc:"Infill density, pattern, and angle settings.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_INFILL, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
