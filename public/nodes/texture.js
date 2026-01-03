(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

window.GCODE_STUDIO.NODE_DEFS["Texture"] = {
  title: "Texture",
  tag: "import",
  desc: "Load a texture image for emboss/deboss nodes.",
  inputs: [],
  outputs: [{ name: "texture", type: "texture" }],
  initData: ()=>({
    dataUrl: "",
    scale: 1
  }),
  render: (node, mount)=>{
    const d = node.data;
    mount.innerHTML = "";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.addEventListener("change", ()=>{
      const f = file.files?.[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        d.dataUrl = String(reader.result || "");
        markDirtyAuto();
        saveState();
        rerenderNode(node.id);
      };
      reader.readAsDataURL(f);
    });
    mount.appendChild(field("Texture image", file));
    mount.appendChild(field("Scale", elNumber(d.scale ?? 1, (v)=>{
      d.scale = v;
      markDirtyAuto();
      saveState();
    }, 0.1)));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = d.dataUrl ? "Texture loaded." : "Load an image to use as a texture source.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>({
    texture: {
      image: node.data.dataUrl || null,
      scale: Number(node.data.scale) || 1
    }
  })
};
})();
