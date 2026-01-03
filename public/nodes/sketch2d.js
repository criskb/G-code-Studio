(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function parseLoops(text){
  const loops = [];
  let current = [];
  const lines = String(text || "").split(/\r?\n/);
  for(const line of lines){
    const trimmed = line.trim();
    if(!trimmed){
      if(current.length){
        loops.push(current);
        current = [];
      }
      continue;
    }
    const parts = trimmed.split(/[,\s]+/).map(Number).filter((v)=>Number.isFinite(v));
    if(parts.length >= 2){
      current.push({ x: parts[0], y: parts[1] });
    }
  }
  if(current.length){
    loops.push(current);
  }
  return loops;
}

window.GCODE_STUDIO.NODE_DEFS["Sketch2D"] = {
  title: "Sketch2D",
  tag: "generator",
  desc: "Sketch simple 2D loops (blank line separates loops).",
  inputs: [],
  outputs: [{ name: "sketch", type: "sketch" }],
  initData: ()=>({
    text: "0,0\n80,0\n80,50\n0,50"
  }),
  render: (node, mount)=>{
    mount.innerHTML = "";
    mount.appendChild(field("Sketch points", elTextarea(node.data.text || "", (v)=>{
      node.data.text = v;
      markDirtyAuto();
      saveState();
    }, 8)));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Enter x,y per line. Use blank lines for multiple loops.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>({
    sketch: {
      loops: parseLoops(node.data.text)
    }
  })
};
})();
