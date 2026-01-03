(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function parseCsv(text){
  const lines = String(text || "").split(/\r?\n/).filter((line)=>line.trim().length);
  return lines.map((line)=>line.split(",").map((cell)=>cell.trim()));
}

window.GCODE_STUDIO.NODE_DEFS["CSV Input"] = {
  title: "CSV Input",
  tag: "import",
  desc: "Paste CSV data for batch/template workflows.",
  inputs: [],
  outputs: [{ name: "csv", type: "csv" }],
  initData: ()=>({
    text: "name,width,height\nTag A,40,20\nTag B,50,25"
  }),
  render: (node, mount)=>{
    const d = node.data;
    mount.innerHTML = "";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".csv,text/csv";
    file.addEventListener("change", async ()=>{
      const f = file.files?.[0];
      if(!f) return;
      d.text = await f.text();
      rerenderNode(node.id);
      markDirtyAuto();
      saveState();
    });
    mount.appendChild(field("Upload CSV", file));
    mount.appendChild(field("CSV Text", elTextarea(d.text || "", (v)=>{
      d.text = v;
      markDirtyAuto();
      saveState();
    }, 8)));
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "First row is treated as headers by many nodes.";
    mount.appendChild(hint);
  },
  evaluate: (node)=>({
    csv: {
      raw: String(node.data.text || ""),
      rows: parseCsv(node.data.text)
    }
  })
};
})();
