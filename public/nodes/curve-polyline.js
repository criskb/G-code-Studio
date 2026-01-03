(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function parsePoints(text){
  const points = [];
  const lines = String(text || "").split(/\r?\n/);
  for(const line of lines){
    const trimmed = line.trim();
    if(!trimmed) continue;
    const parts = trimmed.split(/[,\s]+/).map(Number).filter((v)=>Number.isFinite(v));
    if(parts.length >= 2){
      points.push({ x: parts[0], y: parts[1] });
    }
  }
  return points;
}

window.GCODE_STUDIO.NODE_DEFS["Curve Polyline"] = {
  title: "Curve Polyline",
  tag: "generator",
  desc: "Define a simple polyline curve for boundary blending.",
  inputs: [],
  outputs: [{ name: "curve", type: "curve" }],
  initData: ()=>({
    text: "0,0\n40,0\n60,20\n40,40\n0,40",
    closed: true
  }),
  render: (node, mount)=>{
    const d = node.data;
    mount.innerHTML = "";
    mount.appendChild(field("Points", elTextarea(d.text || "", (v)=>{
      d.text = v;
      markDirtyAuto();
      saveState();
    }, 7)));
    mount.appendChild(field("Closed", elToggle(!!d.closed, (v)=>{
      d.closed = !!v;
      markDirtyAuto();
      saveState();
    })));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Enter x,y per line to define the curve.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>({
    curve: {
      points: parsePoints(node.data.text),
      closed: !!node.data.closed
    }
  })
};
})();
