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

window.GCODE_STUDIO.NODE_DEFS["Icon Library"] = {
  title: "Icon Library",
  tag: "import",
  desc: "Provide a list of SVG icons for sign and label nodes.",
  inputs: [],
  outputs: [{ name: "icons", type: "icons" }],
  initData: ()=>({
    json: "[{\"name\":\"Star\",\"svg\":\"<svg viewBox='0 0 24 24'><path d='M12 2l3 7h7l-5.5 4.2L18 21l-6-4-6 4 1.5-7.8L2 9h7z'/></svg>\"}]"
  }),
  render: (node, mount)=>{
    mount.innerHTML = "";
    mount.appendChild(field("Icons JSON", elTextarea(node.data.json || "", (v)=>{
      node.data.json = v;
      markDirtyAuto();
      saveState();
    }, 8)));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Array of {name, svg} objects. SVG should be plain markup without scripts.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>{
    const parsed = safeJsonParse(node.data.json);
    return { icons: parsed || [] };
  }
};
})();
