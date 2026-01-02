import { SCHEMA_SLICER_COOLING, renderSchema } from './node-helpers.js';

const DEFAULTS = {
  fanFirstLayer:0,
  fanOtherLayers:100,
  minLayerTime:0,
  slowDownBelow:0
};

export default {
  type: 'Slicer Cooling',
  def: {
    title:"Slicer Cooling",
    defaultW:300,
    defaultH:220,
    tag:"slicer",
    desc:"Cooling settings for planar slicing.",
    inputs: [],
    outputs: [{name:"settings", type:"slicer_settings"}],
    initData: ()=>({ ...DEFAULTS }),
    render:(node, mount)=>renderSchema(SCHEMA_SLICER_COOLING, node, mount),
    evaluate:(node)=>({ settings: { ...node.data } })
  }
};
