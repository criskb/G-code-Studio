import { NODE_DEFS, SCHEMA_IMPORT_MESH_V2, SCHEMA_MESH_PRIMITIVE, SCHEMA_MESH_PRIMITIVE_V2, SCHEMA_SLICER_V2, studioDock, annotatePathHints, applyMeshTransform, arrayBufferFromB64, b64FromArrayBuffer, bedAlignMesh, buildFromImage, buildGcodeWithRules, buildMeshIndex, centerMesh, clamp, compileExpr, divider, dividerTiny, downloadText, drawMeshPreview2D, drawWireframe2D, elInput, elNumber, elSelect, elTextarea, elToggle, escapeHTML, field, fmt, genEquation, genFromSVG, genPolar, genSpiralVase, grid2, inferLayer, markDirtyAuto, meshRuntimeCache, meshTopZ, parseSTL, pickLayerHeight,
  rad, refreshNodeContent, renderSchema, rerenderNode, safeName, saveState, schedulePreviewUpdate, sliceMeshPlanar, stopGraphGestures, surfaceRasterPath, toast } from './node-helpers.js';

export default {
  type: 'Path',
  def: {
    title: "Path", tag: "generator",
    desc: "Equation / Polar / Spiral. Produces a parametric path.",
    inputs: [], outputs: [{name:"path", type:"path"}],
    initData: ()=>({
      mode: "equation",
      equation: { x:"A*cos(2*pi*t)", y:"A*sin(2*pi*t)", t0:0, t1:1, steps:600, zMode:"layered", z:"0", layers:50, layerHeight:0.20, rotatePerLayerDeg:0 },
      polar: { r:"A + B*sin(C*2*pi*t)", theta:"2*pi*t*C", t0:0, t1:1, steps:900, zMode:"layered", z:"0", layers:40, layerHeight:0.20, rotatePerLayerDeg:0 },
      spiral: { height:120, layerHeight:0.24, radius:45, turns:120, waveAmp:6, waveFreq:7, stepsPerTurn:18 }
      ,
      // Script mode
      scriptSteps: 900,
      scriptLayerHeight: 0.28,
      scriptCode: `// Return an array of points: {x,y,z, travel?:true, layer?:number, meta?:{layerHeight}}
// Vars available: steps, layerHeight, p (params), base, Math, clamp, lerp, PI, TAU
const pts = [];
for(let i=0;i<steps;i++){
  const t = i/(steps-1);
  const r = 55;
  const a = TAU*6*t;
  const x = r*Math.cos(a);
  const y = r*Math.sin(a);
  const z = 40*t;
  pts.push({x,y,z, meta:{layerHeight}});
}
return pts;`}),
    render: (node, mount)=>{
      const d = node.data;
      mount.innerHTML = "";
      const modeSel = elSelect(d.mode, [["equation","Equation (x(t), y(t))"],["polar","Polar (r(t), θ(t))"],["spiral","Spiral Vase (helical)"]],
        (v)=>{ d.mode=v; rerenderNode(node.id); markDirtyAuto(); saveState(); });
      mount.appendChild(field("Mode", modeSel));
      const hint = document.createElement("div");
      hint.className="hint";
      hint.innerHTML = `Use <code>t</code> in [0..1]. Vars: <code>t</code>, <code>i</code>, <code>n</code>, <code>z</code>, <code>layer</code>.`;
      
      // Script mode (custom)
      if(d.mode==="script"){
        mount.appendChild(grid2([
          field("Steps", elNumber(d.scriptSteps, v=>{ d.scriptSteps = Math.max(2, Math.floor(v||2)); markDirtyAuto(); saveState(); }, 1)),
          field("Layer height", elNumber(d.scriptLayerHeight, v=>{ d.scriptLayerHeight = Number(v||0.2); markDirtyAuto(); saveState(); }, 0.01)),
        ]));
        const ta = elTextarea(d.scriptCode, v=>{ d.scriptCode = v; markDirtyAuto(); saveState(); });
        ta.style.minHeight = "220px";
        mount.appendChild(field("Script (returns points[])", ta));

        const ex = document.createElement("div");
        ex.className="hint";
        ex.innerHTML = `
<b>Tips</b><br>
• Use <code>meta:{layerHeight}</code> on points so Rules/layer logic works.<br>
• Set <code>travel:true</code> on the first point of a segment to force <code>G0</code> (no extrusion).<br>
• Read params via <code>p.A</code>, <code>p.B</code>, etc. (strings → cast with <code>+p.A</code>).<br><br>
<b>Examples (copy/paste)</b><br>
<code>// 1) Helix (single path)</code><br>
<pre style="white-space:pre-wrap;margin:6px 0 10px 0;opacity:.9">const pts=[];
for(let i=0;i&lt;steps;i++){
  const t=i/(steps-1);
  const a=TAU*8*t;
  const r=+p.A||55;
  pts.push({x:r*Math.cos(a), y:r*Math.sin(a), z: ( +p.B||40 )*t, meta:{layerHeight}});
}
return pts;</pre>
<code>// 2) Zigzag raster (segments via travel)</code><br>
<pre style="white-space:pre-wrap;margin:6px 0 10px 0;opacity:.9">const pts=[];
const rows=60, cols=160;
const W=120, H=120;
for(let r=0;r&lt;rows;r++){
  const y=-H/2 + H*r/(rows-1);
  const flip = (r%2);
  for(let c=0;c&lt;cols;c++){
    const u = c/(cols-1);
    const uu = flip? (1-u):u;
    const x=-W/2 + W*uu;
    pts.push({x,y,z:0, travel:(c===0), meta:{layerHeight}});
  }
}
return pts;</pre>
<code>// 3) Multi-layer Lissajous (layer loops)</code><br>
<pre style="white-space:pre-wrap;margin:6px 0 0 0;opacity:.9">const pts=[];
const layers=90;
const per=220;
for(let L=0;L&lt;layers;L++){
  for(let i=0;i&lt;per;i++){
    const t=i/(per-1);
    const x=60*Math.sin(TAU*(3*t));
    const y=60*Math.sin(TAU*(2*t) + L*0.12);
    const z=L*layerHeight;
    pts.push({x,y,z, travel:(i===0), layer:L, meta:{layerHeight}});
  }
}
return pts;</pre>
        `;
        mount.appendChild(ex);
      }

mount.appendChild(hint);
      mount.appendChild(divider());
      if(d.mode==="equation"){
        const g = d.equation;
        mount.appendChild(grid2([ field("x(t)", elInput(g.x, v=>{ g.x=v; markDirtyAuto(); saveState(); })), field("y(t)", elInput(g.y, v=>{ g.y=v; markDirtyAuto(); saveState(); })) ]));
        mount.appendChild(grid2([ field("t0", elNumber(g.t0, v=>{ g.t0=v; markDirtyAuto(); saveState(); }, 0.01)), field("t1", elNumber(g.t1, v=>{ g.t1=v; markDirtyAuto(); saveState(); }, 0.01)) ]));
        mount.appendChild(grid2([ field("Steps", elNumber(g.steps, v=>{ g.steps=Math.max(2, Math.floor(v||2)); markDirtyAuto(); saveState(); }, 1)),
          field("Z mode", elSelect(g.zMode, [["layered","Layered"],["helical","Helical"],["explicit","Explicit z(t)"]], v=>{ g.zMode=v; rerenderNode(node.id); markDirtyAuto(); saveState(); })) ]));
        if(g.zMode==="explicit"){
          mount.appendChild(grid2([ field("z(t)", elInput(g.z, v=>{ g.z=v; markDirtyAuto(); saveState(); })), field("Rot/layer (deg)", elNumber(g.rotatePerLayerDeg, v=>{ g.rotatePerLayerDeg=v||0; markDirtyAuto(); saveState(); }, 0.1)) ]));
        } else {
          mount.appendChild(grid2([ field("Layers", elNumber(g.layers, v=>{ g.layers=Math.max(1, Math.floor(v||1)); markDirtyAuto(); saveState(); }, 1)),
            field("Layer h (mm)", elNumber(g.layerHeight, v=>{ g.layerHeight=Math.max(0.01, v||0.2); markDirtyAuto(); saveState(); }, 0.01)) ]));
          mount.appendChild(grid2([ field("Rot/layer (deg)", elNumber(g.rotatePerLayerDeg, v=>{ g.rotatePerLayerDeg=v||0; markDirtyAuto(); saveState(); }, 0.1)),
            field("z(t) (ignored)", elInput(g.z, v=>{ g.z=v; markDirtyAuto(); saveState(); })) ]));
        }
      }
      if(d.mode==="polar"){
        const g = d.polar;
        mount.appendChild(grid2([ field("r(t)", elInput(g.r, v=>{ g.r=v; markDirtyAuto(); saveState(); })), field("θ(t)", elInput(g.theta, v=>{ g.theta=v; markDirtyAuto(); saveState(); })) ]));
        mount.appendChild(grid2([ field("t0", elNumber(g.t0, v=>{ g.t0=v; markDirtyAuto(); saveState(); }, 0.01)), field("t1", elNumber(g.t1, v=>{ g.t1=v; markDirtyAuto(); saveState(); }, 0.01)) ]));
        mount.appendChild(grid2([ field("Steps", elNumber(g.steps, v=>{ g.steps=Math.max(2, Math.floor(v||2)); markDirtyAuto(); saveState(); }, 1)),
          field("Z mode", elSelect(g.zMode, [["layered","Layered"],["helical","Helical"],["explicit","Explicit z(t)"]], v=>{ g.zMode=v; rerenderNode(node.id); markDirtyAuto(); saveState(); })) ]));
        if(g.zMode==="explicit"){
          mount.appendChild(grid2([ field("z(t)", elInput(g.z, v=>{ g.z=v; markDirtyAuto(); saveState(); })), field("Rot/layer (deg)", elNumber(g.rotatePerLayerDeg, v=>{ g.rotatePerLayerDeg=v||0; markDirtyAuto(); saveState(); }, 0.1)) ]));
        } else {
          mount.appendChild(grid2([ field("Layers", elNumber(g.layers, v=>{ g.layers=Math.max(1, Math.floor(v||1)); markDirtyAuto(); saveState(); }, 1)),
            field("Layer h (mm)", elNumber(g.layerHeight, v=>{ g.layerHeight=Math.max(0.01, v||0.2); markDirtyAuto(); saveState(); }, 0.01)) ]));
          mount.appendChild(grid2([ field("Rot/layer (deg)", elNumber(g.rotatePerLayerDeg, v=>{ g.rotatePerLayerDeg=v||0; markDirtyAuto(); saveState(); }, 0.1)),
            field("z(t) (ignored)", elInput(g.z, v=>{ g.z=v; markDirtyAuto(); saveState(); })) ]));
        }
      }
      if(d.mode==="spiral"){
        const g = d.spiral;
        mount.appendChild(grid2([ field("Height (mm)", elNumber(g.height, v=>{ g.height=Math.max(1, v||1); markDirtyAuto(); saveState(); }, 1)),
          field("Layer h (mm)", elNumber(g.layerHeight, v=>{ g.layerHeight=Math.max(0.01, v||0.24); markDirtyAuto(); saveState(); }, 0.01)) ]));
        mount.appendChild(grid2([ field("Radius (mm)", elNumber(g.radius, v=>{ g.radius=Math.max(0, v||0); markDirtyAuto(); saveState(); }, 0.1)),
          field("Turns", elNumber(g.turns, v=>{ g.turns=Math.max(1, v||1); markDirtyAuto(); saveState(); }, 1)) ]));
        mount.appendChild(grid2([ field("Wave amp (mm)", elNumber(g.waveAmp, v=>{ g.waveAmp=Math.max(0, v||0); markDirtyAuto(); saveState(); }, 0.1)),
          field("Wave freq", elNumber(g.waveFreq, v=>{ g.waveFreq=Math.max(0, v||0); markDirtyAuto(); saveState(); }, 0.1)) ]));
        mount.appendChild(grid2([ field("Steps/turn", elNumber(g.stepsPerTurn, v=>{ g.stepsPerTurn=Math.max(6, Math.floor(v||6)); markDirtyAuto(); saveState(); }, 1)),
          field("—", elInput("", ()=>{}, "")) ]));
      }
    },
    evaluate: (node, ctx)=>{
      const pmap = ctx.pmap;
      const d = node.data;
      if(d.mode==="spiral") return { path: genSpiralVase(d.spiral) };
      if(d.mode==="polar") return { path: genPolar(d.polar, pmap) };
      return { path: genEquation(d.equation, pmap) };
    }
  }
};
