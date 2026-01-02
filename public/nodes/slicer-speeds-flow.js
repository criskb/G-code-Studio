import { SCHEMA_SLICER_SPEEDS_FLOW, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  firstLayerSpeed:900,
  travelSpeed:6000,
  wallSpeed:1800,
  infillSpeed:2400,
  topSpeed:1500,
  bottomSpeed:1200,
  wallFlow:1.0,
  infillFlow:1.0,
  topFlow:1.0,
  bottomFlow:1.0
};

export default {
  type: 'Slicer Speeds/Flow',
  def: {
    title:"Slicer Speeds/Flow",
    defaultW:330,
    defaultH:300,
    tag:"slicer",
    desc:"Speed and flow defaults by role.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_SPEEDS_FLOW, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
