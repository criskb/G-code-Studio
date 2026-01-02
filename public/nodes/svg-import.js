window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['SVG Import'] = {
    title: "SVG Import", tag: "import",
    desc: "Upload or paste an SVG, sample geometry into a toolpath.",
    inputs: [], outputs: [{name:"path", type:"path"}],
    initData: ()=>({
      svgText: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M 50 90 C 20 70, 5 50, 18 32 C 28 18, 45 24, 50 35 C 55 24, 72 18, 82 32 C 95 50, 80 70, 50 90 Z" />
</svg>`,
      sampleStep: 1.2,
      scaleMmPerUnit: 1.2,
      center: true,
      zMode: "layered",
      layers: 26,
      layerHeight: 0.22,
      height: 60,
      rotatePerLayerDeg: 2,
    }),
    render: (node, mount)=>{
      const d = node.data;
      mount.innerHTML = "";
      const file = document.createElement("input");
      file.type="file";
      file.accept=".svg,image/svg+xml";
      file.addEventListener("change", async ()=>{
        const f = file.files?.[0];
        file.value="";
        if(!f) return;
        const txt = await f.text();
        d.svgText = txt;
        rerenderNode(node.id);
        markDirtyAuto(); saveState();
        toast("SVG loaded");
      });
      mount.appendChild(field("Upload SVG", file));
      mount.appendChild(field("SVG Text", elTextarea(d.svgText, v=>{ d.svgText=v; markDirtyAuto(); saveState(); }, 7)));
      mount.appendChild(grid2([
        field("Sample step", elNumber(d.sampleStep, v=>{ d.sampleStep=Math.max(0.1, v||1.5); markDirtyAuto(); saveState(); }, 0.1)),
        field("Scale mm/unit", elNumber(d.scaleMmPerUnit, v=>{ d.scaleMmPerUnit=Math.max(0.0001, v||1); markDirtyAuto(); saveState(); }, 0.01)),
      ]));
      mount.appendChild(grid2([
        field("Center", elSelect(String(d.center), [["true","Yes"],["false","No"]], v=>{ d.center=(v==="true"); markDirtyAuto(); saveState(); })),
        field("Z mode", elSelect(d.zMode, [["flat","Flat"],["layered","Layered"],["helical","Helical"]], v=>{ d.zMode=v; rerenderNode(node.id); markDirtyAuto(); saveState(); }))
      ]));
      if(d.zMode==="layered"){
        mount.appendChild(grid2([
          field("Layers", elNumber(d.layers, v=>{ d.layers=Math.max(1, Math.floor(v||1)); markDirtyAuto(); saveState(); }, 1)),
          field("Layer h (mm)", elNumber(d.layerHeight, v=>{ d.layerHeight=Math.max(0.01, v||0.2); markDirtyAuto(); saveState(); }, 0.01))
        ]));
        mount.appendChild(grid2([
          field("Rot/layer (deg)", elNumber(d.rotatePerLayerDeg, v=>{ d.rotatePerLayerDeg=v||0; markDirtyAuto(); saveState(); }, 0.1)),
          field("—", elInput("", ()=>{}, ""))
        ]));
      }
      if(d.zMode==="helical"){
        mount.appendChild(grid2([
          field("Height (mm)", elNumber(d.height, v=>{ d.height=Math.max(1, v||1); markDirtyAuto(); saveState(); }, 1)),
          field("—", elInput("", ()=>{}, ""))
        ]));
      }
    },
    evaluate: (node)=>({ path: genFromSVG(node.data) })
  };
