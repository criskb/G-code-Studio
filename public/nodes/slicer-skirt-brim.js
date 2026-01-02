import { SCHEMA_SLICER_SKIRT_BRIM, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  skirtLines:0,
  skirtDistance:6,
  brimWidth:0,
  brimLines:0
};

export default {
  type: 'Slicer Skirt/Brim',
  def: {
    title:"Slicer Skirt/Brim",
    defaultW:300,
    defaultH:220,
    tag:"slicer",
    desc:"Skirt and brim generation settings.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_SKIRT_BRIM, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
