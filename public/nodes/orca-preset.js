window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Orca Preset'] = {
    title:"Orca Preset", tag:"machine",
    desc:"Import OrcaSlicer preset bundles (.orca_printer / .orca_filament) and output a Printer profile.",
    inputs: [], outputs:[{name:"profile", type:"profile"}],
    initData: ()=>({ printerId:"", filamentId:"", processId:"" }),
    render:(node, mount)=>{
      const d=node.data;
      const orca = ensureOrcaStore();
      mount.innerHTML="";

      const fileInput = document.createElement("input");
      fileInput.type="file";
      fileInput.multiple=true;
      fileInput.accept=".orca_printer,.orca_filament,.zip,.json";
      fileInput.style.display="none";
      fileInput.addEventListener("change", async ()=>{
        await importOrcaFilesFromInput(fileInput.files);
        fileInput.value="";
        rerenderNode(node.id);
      });

      const topRow = document.createElement("div");
      topRow.style.display="flex";
      topRow.style.gap="8px";
      topRow.style.alignItems="center";
      const btn = document.createElement("button");
      btn.className="btn";
      btn.textContent="Import Orca Bundles";
      btn.addEventListener("click", ()=>fileInput.click());
      const info = document.createElement("div");
      info.className="hint";
      info.textContent=`Loaded: ${orca.printers.length} printers • ${orca.filaments.length} filaments • ${orca.processes.length} processes`;
      topRow.appendChild(btn);
      mount.appendChild(topRow);
      mount.appendChild(fileInput);
      mount.appendChild(info);

      const mkOpts = (list)=> list.map(e=>[e.id, e.name]);

      mount.appendChild(grid2([
        field("Printer preset", elSelect(d.printerId||"", [["","Auto"], ...mkOpts(orca.printers)], (v)=>{ d.printerId=v; saveState(); markDirtyAuto(); })),
        field("Filament preset", elSelect(d.filamentId||"", [["","Auto"], ...mkOpts(orca.filaments)], (v)=>{ d.filamentId=v; saveState(); markDirtyAuto(); })),
        field("Process preset", elSelect(d.processId||"", [["","Auto"], ...mkOpts(orca.processes)], (v)=>{ d.processId=v; saveState(); markDirtyAuto(); }))
      ]));

      const tip = document.createElement("div");
      tip.className="hint";
      tip.textContent="Tip: In OrcaSlicer use Export → Config Bundle / Filament Bundle, then import here. Connect this node's Profile output to Export → profile.";
      mount.appendChild(tip);
    },
    evaluate:(node, ctx)=>{
      const orca = ensureOrcaStore();
      const d=node.data;
      const mach = orcaFirst(orca.printers, d.printerId)?.obj || null;
      const fil  = orcaFirst(orca.filaments, d.filamentId)?.obj || null;
      const proc = orcaFirst(orca.processes, d.processId)?.obj || null;
      const base = defaultPrinterFallback();
      const profile = mapOrcaToPrinterProfile(mach, fil, proc, base);
      return { profile };
    }
  };
