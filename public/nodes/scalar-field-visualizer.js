window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function scalarDefaults(profile){
  const base = profile || {};
  return {
    width: Number(base.lineWidth || 0.45),
    height: Number(base.layerHeight || 0.2),
    f: Number(base.speedPrint || 1800),
    temp: Number(base.tempNozzle || 210),
    fan: Number(base.fanOtherLayers || 128)
  };
}

function scalarFromMove(move, field, defaults){
  const w = move?.meta?.width ?? defaults.width;
  const h = move?.meta?.height ?? defaults.height;
  const f = (move?.meta?.motion?.actualSpeed != null)
    ? move.meta.motion.actualSpeed * 60
    : (move.f ?? defaults.f);
  const speedMmS = f / 60;
  if(field === "speed") return speedMmS;
  if(field === "flow") return w*h*speedMmS;
  if(field === "linewidth") return w;
  if(field === "temp") return move?.meta?.temp ?? defaults.temp;
  if(field === "fan") return move?.meta?.fan ?? defaults.fan;
  if(field === "accel") return move?.meta?.motion?.accel ?? speedMmS;
  if(field === "jerkProxy") return move?.meta?.motion?.jerkProxy ?? speedMmS;
  if(field === "cornering") return move?.meta?.motion?.cornering ?? speedMmS;
  return speedMmS;
}

function paletteColor(palette, t){
  const tt = Math.max(0, Math.min(1, t));
  if(palette === "grayscale"){
    const v = Math.round(255 * tt);
    return [v/255, v/255, v/255, 0.95];
  }
  if(palette === "viridis"){
    const stops = [
      [68,1,84],
      [59,82,139],
      [33,145,140],
      [94,201,97],
      [253,231,37]
    ];
    const seg = (stops.length - 1) * tt;
    const i = Math.min(stops.length - 2, Math.floor(seg));
    const u = seg - i;
    const a = stops[i];
    const b = stops[i+1];
    const r = a[0] + (b[0]-a[0]) * u;
    const g = a[1] + (b[1]-a[1]) * u;
    const bl = a[2] + (b[2]-a[2]) * u;
    return [r/255, g/255, bl/255, 0.95];
  }
  const stops = [
    [66, 245, 255],
    [82, 160, 255],
    [176, 112, 255],
    [255, 179, 71]
  ];
  const seg = (stops.length - 1) * tt;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const u = seg - i;
  const a = stops[i];
  const b = stops[i+1];
  const r = a[0] + (b[0]-a[0]) * u;
  const g = a[1] + (b[1]-a[1]) * u;
  const bl = a[2] + (b[2]-a[2]) * u;
  return [r/255, g/255, bl/255, 0.95];
}

function formatLegend(field, minVal, maxVal){
  const unitMap = {
    speed:"mm/s",
    flow:"mm³/s",
    accel:"mm/s²",
    linewidth:"mm",
    temp:"°C",
    fan:"0-255",
    jerkProxy:"mm/s",
    cornering:"mm/s"
  };
  return {
    field,
    min:minVal,
    max:maxVal,
    unit: unitMap[field] || ""
  };
}

function legendStops(palette){
  const stops = [];
  for(let i=0;i<6;i++){
    const t = i/5;
    const c = paletteColor(palette, t);
    const rgb = c.slice(0,3).map(v=>Math.round(v*255));
    stops.push(`rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
  }
  return stops;
}

window.GCODE_STUDIO.NODE_DEFS['scalar-field-visualizer'] = {
  title:"Scalar Field Visualizer",
  tag:"preview",
  desc:"Colors toolpath by scalar field and emits a legend/markers.",
  inputs:[
    {name:"toolpath", type:"toolpath"},
    {name:"motionReport", type:"json"}
  ],
  outputs:[
    {name:"coloredToolpath", type:"toolpath"},
    {name:"legend", type:"json"},
    {name:"hotspots", type:"json"}
  ],
  initData:()=>({
    field:"speed",
    rangeMode:"auto",
    minValue:0,
    maxValue:100,
    palette:"prusaLike"
  }),
  render:(node, mount)=>{
    mount.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.innerHTML = "Sets <code>meta.visual</code> on moves for overlay coloring.";
    mount.appendChild(hint);
    const form = document.createElement("div");
    renderSchema(SCHEMA_SCALAR_FIELD_VIS, node, form);
    mount.appendChild(form);
  },
  evaluate:(node, ctx)=>{
    const tpIn = ctx.getInput(node.id, "toolpath");
    if(!tpIn || !tpIn.layers) return { coloredToolpath:null, legend:null, hotspots:[] };

    const d = node.data || {};
    const profile = ctx.defaultProfile || defaultPrinterFallback();
    const defaults = scalarDefaults(profile);

    const values = [];
    for(const layer of tpIn.layers){
      for(const move of (layer.moves || [])){
        const v = scalarFromMove(move, d.field, defaults);
        if(Number.isFinite(v)) values.push(v);
      }
    }

    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if(!values.length){ minVal = 0; maxVal = 1; }

    if(d.rangeMode === "manual"){
      minVal = Number(d.minValue ?? minVal);
      maxVal = Number(d.maxValue ?? maxVal);
      if(minVal === maxVal){ maxVal = minVal + 1; }
    }

    const hotspots = [];
    const colored = {
      units: tpIn.units || "mm",
      absoluteExtrusion: tpIn.absoluteExtrusion !== false,
      layers: [],
      stats: {...(tpIn.stats || {})}
    };

    for(const layer of tpIn.layers){
      const moves = [];
      for(const move of (layer.moves || [])){
        const v = scalarFromMove(move, d.field, defaults);
        const t = (v - minVal) / Math.max(1e-6, (maxVal - minVal));
        const color = paletteColor(d.palette, t);
        const meta = (move.meta && typeof move.meta === "object") ? {...move.meta} : (move.meta ? {value:move.meta} : {});
        meta.visual = { field:d.field, value:v, t:Math.max(0, Math.min(1, t)), color };
        moves.push({ ...move, meta });

        if(move.kind === "extrude" && Number.isFinite(v)){
          hotspots.push({ value:v, x:move.x, y:move.y, z:move.z, label:`${d.field}: ${v.toFixed(1)}` });
        }
      }
      colored.layers.push({ z: layer.z, moves });
    }

    hotspots.sort((a,b)=>b.value - a.value);
    const legend = { ...formatLegend(d.field, minVal, maxVal), palette:d.palette, colors: legendStops(d.palette) };

    return {
      coloredToolpath: colored,
      legend,
      hotspots: hotspots.slice(0, 5),
      preview: {
        type:"toolpath",
        toolpath: colored,
        overlays:["featureType", d.field, "flow"].filter((v,i,a)=>a.indexOf(v)===i),
        markers: hotspots.slice(0, 5).map(h=>({x:h.x,y:h.y,z:h.z,label:h.label})),
        legend
      }
    };
  }
};
