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

window.GCODE_STUDIO.NODE_DEFS["Constraints Input"] = {
  title: "Constraints Input",
  tag: "import",
  desc: "Provide constraint definitions for layout planning.",
  inputs: [],
  outputs: [{ name: "constraints", type: "constraints" }],
  initData: ()=>({
    json: "[{\"type\":\"keep-out\",\"x\":0,\"y\":0,\"r\":15},{\"type\":\"align\",\"axis\":\"x\",\"value\":0}]"
  }),
  render: (node, mount)=>{
    mount.innerHTML = "";
    mount.appendChild(field("Constraints JSON", elTextarea(node.data.json || "", (v)=>{
      node.data.json = v;
      markDirtyAuto();
      saveState();
    }, 8)));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Paste an array of constraint objects. Input wins over defaults.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>{
    const parsed = safeJsonParse(node.data.json);
    return { constraints: parsed || [] };
  }
};
})();
