import { SCHEMA_SLICER_RETRACTION_TRAVEL, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  retract:0.8,
  retractSpeed:1800,
  retractMinTravel:1.0,
  zHop:0,
  wipe:false,
  coast:false
};

export default {
  type: 'Slicer Retraction/Travel',
  def: {
    title:"Slicer Retraction/Travel",
    defaultW:320,
    defaultH:260,
    tag:"slicer",
    desc:"Retraction and travel behavior settings.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_RETRACTION_TRAVEL, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
