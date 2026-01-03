window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Toolpath → Path'] = {
  title:"Toolpath → Path",
  tag:"path",
  desc:"Convert a toolpath structure into a path array for path-based nodes.",
  inputs: [{name:"toolpath", type:"toolpath"}],
  outputs: [{name:"path", type:"path"}],
  initData: ()=>({}),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Wraps <code>toolpathToPath()</code> for path-only nodes.";
    mount.appendChild(hint);
  },
  evaluate:(node, ctx)=>{
    const toolpathIn = ctx.getInput(node.id, "toolpath");
    const toolpath = toolpathIn?.toolpath || toolpathIn?.out || toolpathIn || null;
    if(!toolpath) return { path: [] };
    const converted = toolpathToPath(toolpath);
    return { path: Array.isArray(converted?.path) ? converted.path : [] };
  }
};
