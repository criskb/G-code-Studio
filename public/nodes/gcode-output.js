window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['G-code Output'] = {
  title:"G-code Output",
  tag:"ui",
  desc:"Docked G-code output viewer.",
  inputs: [{name:"gcode", type:"gcode"}],
  outputs: [],
  defaultW: 560,
  defaultH: 520,
  initData: ()=>({}),
  render:(node, mount)=>{
    initGcodeDock();
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "gcodeDock";
    mount.appendChild(wrap);

    if(gcodeDock.body) wrap.appendChild(gcodeDock.body);
    else{
      const h = document.createElement("div");
      h.className = "hint";
      h.textContent = "G-code dock missing. (It should be created automatically.)";
      wrap.appendChild(h);
    }

    stopGraphGestures(wrap.querySelector("#btnCopy"));
    stopGraphGestures(wrap.querySelector("#btnClearOut"));
    stopGraphGestures(wrap.querySelector("#gcodePre"));
  },
  evaluate:(node, ctx)=>{
    const gcodeIn = ctx.getInput(node.id, "gcode");
    const gcode = (gcodeIn?.gcode || gcodeIn?.out || gcodeIn || "");
    state.outputs.gcode = gcode || "";
    return { gcode };
  },
  defaultSize: { w: 560, h: 520 }
};
