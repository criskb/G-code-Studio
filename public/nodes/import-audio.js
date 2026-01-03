(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

window.GCODE_STUDIO.NODE_DEFS['Import Audio'] = {
  title: "Import Audio",
  tag: "import",
  desc: "Upload an audio file and output audio data for modulation nodes.",
  inputs: [],
  outputs: [{name:"audio", type:"audio"}],
  initData: ()=>({
    name: "",
    mime: "",
    dataUrl: ""
  }),
  render: (node, mount)=>{
    const d = node.data;
    mount.innerHTML = "";

    const file = document.createElement("input");
    file.type = "file";
    file.accept = "audio/*";
    file.addEventListener("change", async ()=>{
      const f = file.files?.[0];
      file.value = "";
      if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        d.name = f.name || "";
        d.mime = f.type || "";
        d.dataUrl = String(reader.result || "");
        markDirtyAuto();
        saveState();
        rerenderNode(node.id);
        toast("Audio loaded");
      };
      reader.readAsDataURL(f);
    });

    const name = document.createElement("div");
    name.className = "hint";
    name.textContent = d.name ? `Loaded: ${d.name}` : "No audio loaded.";

    mount.appendChild(field("Upload audio", file));
    mount.appendChild(name);
  },
  evaluate: (node)=>{
    const d = node.data || {};
    if(!d.dataUrl) return { audio: null };
    return {
      audio: {
        name: d.name,
        mime: d.mime,
        dataUrl: d.dataUrl
      }
    };
  }
};
})();
