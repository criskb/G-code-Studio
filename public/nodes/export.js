window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Export'] = {
    title:"Export", tag:"output",
    uiSchema:SCHEMA_EXPORT,
  desc:"Generate G-code (needs Path + Printer; Rules optional).",
    inputs: [{name:"path", type:"path"}, {name:"rules", type:"rules"}, {name:"profile", type:"profile"}, {name:"mesh", type:"mesh"}],
    outputs: [{name:"gcode", type:"gcode"}, {name:"path", type:"path"}, {name:"mesh", type:"mesh"}],
    initData: ()=>({ addLayerComments:true, capPreviewChars:200000, fileName:"gcode-studio_output" }),
    render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
    evaluate:(node, ctx)=>{
      const pathIn = ctx.getInput(node.id, "path");
      const rulesIn = ctx.getInput(node.id, "rules");
      const profIn = ctx.getInput(node.id, "profile");
      const meshIn = ctx.getInput(node.id, "mesh");
      const path = (pathIn?.out || pathIn?.path || pathIn || []);
      const profile = (profIn?.profile || profIn || ctx.defaultProfile || null);
      const rules = (rulesIn?.rules || rulesIn || null);
      const mesh = (meshIn?.mesh || meshIn?.out || meshIn || null);
      if(!profile) throw new Error("Export: missing Printer profile input");
      const safePath = Array.isArray(path) ? path.filter(Boolean) : [];
      const {gcode, stats, machinePath} = buildGcodeWithRules(safePath, profile, rules, node.data.addLayerComments);
      state.outputs.gcode = gcode;
      state.outputs.stats = stats;
      state.outputs.path = machinePath;
      state.outputs.mesh = mesh || null;
      return { gcode, path: machinePath, mesh };
    }
  };
