(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function safeJsonParse(value){
  if(typeof value !== "string" || !value.trim()) return null;
  try{
    return JSON.parse(value);
  }catch(_){
    return null;
  }
}

window.GCODE_STUDIO.NODE_DEFS["Field Map"] = {
  title: "Field Map",
  tag: "generator",
  desc: "Define a simple scalar field (constant value or JSON override).",
  inputs: [],
  outputs: [{ name: "field", type: "field" }],
  initData: ()=>({
    value: 0.5,
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
    json: ""
  }),
  render: (node, mount)=>{
    const d = node.data;
    mount.innerHTML = "";
    mount.appendChild(field("Value", elNumber(d.value ?? 0.5, (v)=>{
      d.value = v;
      markDirtyAuto();
      saveState();
    }, 0.01)));
    mount.appendChild(grid2([
      field("Min X", elNumber(d.minX ?? 0, (v)=>{ d.minX = v; markDirtyAuto(); saveState(); }, 0.1)),
      field("Min Y", elNumber(d.minY ?? 0, (v)=>{ d.minY = v; markDirtyAuto(); saveState(); }, 0.1))
    ]));
    mount.appendChild(grid2([
      field("Max X", elNumber(d.maxX ?? 100, (v)=>{ d.maxX = v; markDirtyAuto(); saveState(); }, 0.1)),
      field("Max Y", elNumber(d.maxY ?? 100, (v)=>{ d.maxY = v; markDirtyAuto(); saveState(); }, 0.1))
    ]));
    mount.appendChild(field("JSON override", elTextarea(d.json || "", (v)=>{
      d.json = v;
      markDirtyAuto();
      saveState();
    }, 6)));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Leave JSON empty to emit a constant field. JSON override should be an object or array used by downstream nodes.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>{
    const d = node.data;
    const override = safeJsonParse(d.json);
    if(override !== null){
      return { field: override };
    }
    return {
      field: {
        type: "constant",
        value: Number.isFinite(Number(d.value)) ? Number(d.value) : 0,
        bounds: {
          minX: Number(d.minX) || 0,
          minY: Number(d.minY) || 0,
          maxX: Number(d.maxX) || 0,
          maxY: Number(d.maxY) || 0
        }
      }
    };
  }
};
})();
