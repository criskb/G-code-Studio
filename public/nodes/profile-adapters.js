(function(){
window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const safeJsonParse = (value)=>{
  if(typeof value !== "string" || !value.trim()) return null;
  try{
    return JSON.parse(value);
  }catch(_){
    return null;
  }
};

function renderProfileAdapter(node, mount, label, hint){
  mount.innerHTML = "";
  const fieldWrap = field(label, elTextarea(node.data.json || "", (v)=>{
    node.data.json = v;
    markDirtyAuto();
    saveState();
  }, 6));
  mount.appendChild(fieldWrap);
  const hintEl = document.createElement("div");
  hintEl.className = "hint";
  hintEl.textContent = hint;
  mount.appendChild(hintEl);
}

function pickFromProfile(input, key){
  if(!input) return null;
  if(input[key]) return input[key];
  if(input.profile && input.profile[key]) return input.profile[key];
  return input;
}

function registerAdapter({
  title,
  tag,
  desc,
  outputName,
  outputType,
  inputKey,
  hint
}){
  window.GCODE_STUDIO.NODE_DEFS[title] = {
    title,
    tag,
    desc,
    inputs: [{name:"profile", type:"profile"}],
    outputs: [{name:outputName, type:outputType}],
    initData: ()=>(
      { json:"" }
    ),
    render: (node, mount)=>renderProfileAdapter(node, mount, `${title} JSON`, hint),
    evaluate: (node, ctx)=>{
      const input = ctx.getInput(node.id, "profile");
      const adapted = pickFromProfile(input, inputKey);
      const fallback = safeJsonParse(node.data.json) || null;
      return { [outputName]: adapted ?? fallback };
    }
  };
}

registerAdapter({
  title: "Machine Profile",
  tag: "machine",
  desc: "Provide machine-only settings for analysis and safety nodes.",
  outputName: "machineProfile",
  outputType: "machineProfile",
  inputKey: "machineProfile",
  hint: "Connect a Printer/Orca Preset Profile output to adapt it, or paste machine JSON here. Input wins over JSON."
});

registerAdapter({
  title: "Material Profile",
  tag: "material",
  desc: "Provide material-only settings for extrusion tuning nodes.",
  outputName: "materialProfile",
  outputType: "materialProfile",
  inputKey: "materialProfile",
  hint: "Connect a Profile output to adapt it, or paste material JSON here. Input wins over JSON."
});

registerAdapter({
  title: "Resonance Profile",
  tag: "motion",
  desc: "Provide resonance/input-shaper characterization data.",
  outputName: "resonanceProfile",
  outputType: "resonanceProfile",
  inputKey: "resonanceProfile",
  hint: "Connect a Profile output that includes resonance data, or paste resonance JSON here. Input wins over JSON."
});

registerAdapter({
  title: "Bed Mesh",
  tag: "machine",
  desc: "Provide bed mesh probe data for compensation nodes.",
  outputName: "bedMesh",
  outputType: "bedMesh",
  inputKey: "bedMesh",
  hint: "Paste a bed mesh JSON export or connect a Profile output that already includes bed mesh data."
});

})();
