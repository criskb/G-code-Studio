(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function rectPoints(cx, cy, w, h){
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh }
  ];
}

window.GCODE_STUDIO.NODE_DEFS["Region Rectangle"] = {
  title: "Region Rectangle",
  tag: "generator",
  desc: "Create a rectangular region for boundary blends.",
  inputs: [],
  outputs: [{ name: "region", type: "region" }],
  initData: ()=>({
    centerX: 0,
    centerY: 0,
    width: 60,
    height: 40
  }),
  render: (node, mount)=>{
    const d = node.data;
    mount.innerHTML = "";
    mount.appendChild(grid2([
      field("Center X", elNumber(d.centerX ?? 0, (v)=>{ d.centerX = v; markDirtyAuto(); saveState(); }, 0.1)),
      field("Center Y", elNumber(d.centerY ?? 0, (v)=>{ d.centerY = v; markDirtyAuto(); saveState(); }, 0.1))
    ]));
    mount.appendChild(grid2([
      field("Width", elNumber(d.width ?? 60, (v)=>{ d.width = Math.max(0, v || 0); markDirtyAuto(); saveState(); }, 0.1)),
      field("Height", elNumber(d.height ?? 40, (v)=>{ d.height = Math.max(0, v || 0); markDirtyAuto(); saveState(); }, 0.1))
    ]));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Outputs a simple rectangular region polygon.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>{
    const d = node.data;
    const cx = Number(d.centerX) || 0;
    const cy = Number(d.centerY) || 0;
    const w = Number(d.width) || 0;
    const h = Number(d.height) || 0;
    return {
      region: {
        type: "rect",
        center: { x: cx, y: cy },
        width: w,
        height: h,
        points: rectPoints(cx, cy, w, h)
      }
    };
  }
};
})();
