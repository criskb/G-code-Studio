(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function parseContours(text){
  const contours = [];
  let current = [];
  const lines = String(text || "").split(/\r?\n/);
  for(const line of lines){
    const trimmed = line.trim();
    if(!trimmed){
      if(current.length){
        contours.push(current);
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
    contours.push(current);
  }
  return contours;
}

window.GCODE_STUDIO.NODE_DEFS["Contours Import"] = {
  title: "Contours Import",
  tag: "import",
  desc: "Paste contour polylines (blank line separates contours).",
  inputs: [],
  outputs: [{ name: "contours", type: "contours" }],
  initData: ()=>({
    text: "0,0\n60,0\n60,40\n0,40\n\n10,10\n50,10\n50,30\n10,30"
  }),
  render: (node, mount)=>{
    mount.innerHTML = "";
    mount.appendChild(field("Contours", elTextarea(node.data.text || "", (v)=>{
      node.data.text = v;
      markDirtyAuto();
      saveState();
    }, 8)));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Enter x,y pairs per line. Use blank lines to separate contours.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>({ contours: parseContours(node.data.text) })
};
})();
