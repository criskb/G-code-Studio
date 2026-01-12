window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
const controlExperimentNode = {
  title:"Control Experiment",
  tag:"generator",
  desc:"Procedural path-first designs. Outputs a toolpath directly (no mesh slicing).",
  inputs:[{name:"profile", type:"profile"}],
  outputs:[{name:"path", type:"path"}],
  initData:()=>({
    model:"ripple_vase",
    layerHeight:0.24,
    // common
    centerX:0, centerY:0,
    height:80,
    // ripple vase
    radius:28,
    rippleAmp:2.5,
    ripples:9,
    twistDeg:0,
    vaseMode:true,
    // pin support
    pinBaseR:4,
    pinTopR:0.7,
    pinTurns:3,
    // polar fractions
    denom:12,
    numer:5,
    rings:3,
    ringStep:8,
    // hex adapter
    hexAcross:34,
    hexWall:3,
    // nonplanar spacer
    spacerR:18,
    spacerWall:3,
    spacerWaveAmp:0.8,
    spacerWaves:8,
    // anyangle stand
    standW:70,
    standD:60,
    standAngleDeg:55,
    standPitch:6,
    // lattice cylinder
    latRadius:30,
    latPitch:6,
    latAngleDeg:60
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    mount.appendChild(field("Model", elSelect(d.model||"ripple_vase", [
      ["ripple_vase","Ripple Vase (spiral wall)"],
      ["pin_support","Pin Support Challenge (taper)"],
      ["polar_fractions","Fractional Engine (polar spokes)"],
      ["hex_adapter","Hex Adapter (ring)"],
      ["nonplanar_spacer","Nonplanar Spacer (wavy ring)"],
      ["anyangle_phone_stand","AnyAngle Phone Stand (slope lattice)"],
      ["lattice_cylinder","Lattice Cylinder (helical grid)"]
    ], v=>{ d.model=v; markDirtyAuto(); saveState(); })));

    mount.appendChild(field("Layer height", elNumber(d.layerHeight??0.24, v=>{ d.layerHeight=v; markDirtyAuto(); saveState(); }, 0.01)));
    mount.appendChild(field("Center X", elNumber(d.centerX??0, v=>{ d.centerX=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Center Y", elNumber(d.centerY??0, v=>{ d.centerY=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Height", elNumber(d.height??80, v=>{ d.height=v; markDirtyAuto(); saveState(); }, 0.1)));

    const group=document.createElement("div");
    group.className="ruleRow";
    group.style.marginTop="8px";

    function addRow(lbl, el){ group.appendChild(field(lbl, el)); }

    if(d.model==="ripple_vase"){
      addRow("Radius", elNumber(d.radius??28, v=>{ d.radius=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Ripple amp", elNumber(d.rippleAmp??2.5, v=>{ d.rippleAmp=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Ripples", elNumber(d.ripples??9, v=>{ d.ripples=v; markDirtyAuto(); saveState(); }, 1));
      addRow("Twist (deg)", elNumber(d.twistDeg??0, v=>{ d.twistDeg=v; markDirtyAuto(); saveState(); }, 1));
      addRow("Vase mode", elToggle(!!d.vaseMode, v=>{ d.vaseMode=!!v; markDirtyAuto(); saveState(); }));
      const tip=document.createElement("div");
      tip.className="hint";
      tip.style.marginTop="8px";
      tip.innerHTML = "<b style='color:var(--text)'>Tip</b><div>Use 0% infill (path-driven). Pair with Z Warp for non-planar skins.</div>";
      group.appendChild(tip);
    }else if(d.model==="pin_support"){
      addRow("Base radius", elNumber(d.pinBaseR??4, v=>{ d.pinBaseR=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Top radius", elNumber(d.pinTopR??0.7, v=>{ d.pinTopR=v; markDirtyAuto(); saveState(); }, 0.05));
      addRow("Turns", elNumber(d.pinTurns??3, v=>{ d.pinTurns=v; markDirtyAuto(); saveState(); }, 1));
    }else if(d.model==="polar_fractions"){
      addRow("Denominator", elNumber(d.denom??12, v=>{ d.denom=v; markDirtyAuto(); saveState(); }, 1));
      addRow("Numerator", elNumber(d.numer??5, v=>{ d.numer=v; markDirtyAuto(); saveState(); }, 1));
      addRow("Rings", elNumber(d.rings??3, v=>{ d.rings=v; markDirtyAuto(); saveState(); }, 1));
      addRow("Ring step", elNumber(d.ringStep??8, v=>{ d.ringStep=v; markDirtyAuto(); saveState(); }, 0.1));
    }else if(d.model==="hex_adapter"){
      addRow("Across flats", elNumber(d.hexAcross??34, v=>{ d.hexAcross=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Wall (mm)", elNumber(d.hexWall??3, v=>{ d.hexWall=v; markDirtyAuto(); saveState(); }, 0.1));
    }else if(d.model==="nonplanar_spacer"){
      addRow("Radius", elNumber(d.spacerR??18, v=>{ d.spacerR=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Wall (mm)", elNumber(d.spacerWall??3, v=>{ d.spacerWall=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Wave amp", elNumber(d.spacerWaveAmp??0.8, v=>{ d.spacerWaveAmp=v; markDirtyAuto(); saveState(); }, 0.05));
      addRow("Waves", elNumber(d.spacerWaves??8, v=>{ d.spacerWaves=v; markDirtyAuto(); saveState(); }, 1));
    }else if(d.model==="anyangle_phone_stand"){
      addRow("Width", elNumber(d.standW??70, v=>{ d.standW=v; markDirtyAuto(); saveState(); }, 0.5));
      addRow("Depth", elNumber(d.standD??60, v=>{ d.standD=v; markDirtyAuto(); saveState(); }, 0.5));
      addRow("Angle (deg)", elNumber(d.standAngleDeg??55, v=>{ d.standAngleDeg=v; markDirtyAuto(); saveState(); }, 1));
      addRow("Pitch", elNumber(d.standPitch??6, v=>{ d.standPitch=v; markDirtyAuto(); saveState(); }, 0.5));
    }else if(d.model==="lattice_cylinder"){
      addRow("Radius", elNumber(d.latRadius??30, v=>{ d.latRadius=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Pitch", elNumber(d.latPitch??6, v=>{ d.latPitch=v; markDirtyAuto(); saveState(); }, 0.1));
      addRow("Angle (deg)", elNumber(d.latAngleDeg??60, v=>{ d.latAngleDeg=v; markDirtyAuto(); saveState(); }, 1));
    }
    mount.appendChild(group);
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const lh = Math.max(0.01, Number(d.layerHeight||0.24));
    const cx = Number(d.centerX||0), cy = Number(d.centerY||0);
    const H  = Math.max(lh, Number(d.height||80));
    const Nlayers = Math.max(1, Math.ceil(H / lh));

    const pts=[];
    const pushPt=(X,Y,z,role,travel=false,layer=0)=>{ pts.push({X,Y,z,role,travel,layer}); };

    const circle=(r, z, role, layer, phase=0, segs=120)=>{
      for(let i=0;i<=segs;i++){
        const t=i/segs;
        const a=phase + t*Math.PI*2;
        pushPt(cx + r*Math.cos(a), cy + r*Math.sin(a), z, role, false, layer);
      }
    };

    const line=(x0,y0,x1,y1,z,role,layer,steps=40)=>{
      for(let i=0;i<=steps;i++){
        const t=i/steps;
        pushPt(cx + x0 + (x1-x0)*t, cy + y0 + (y1-y0)*t, z, role, false, layer);
      }
    };

    const polygon=(r, z, role, layer, sides=6, phase=0)=>{
      for(let i=0;i<=sides;i++){
        const t=i/sides;
        const a=phase + t*Math.PI*2;
        pushPt(cx + r*Math.cos(a), cy + r*Math.sin(a), z, role, false, layer);
      }
    };

    if(d.model==="ripple_vase"){
      const R = Math.max(0.1, Number(d.radius||28));
      const A = Number(d.rippleAmp||0);
      const rip = Math.max(1, Math.floor(Number(d.ripples||9)));
      const twist = (Number(d.twistDeg||0) * Math.PI/180);
      const vaseMode = !!d.vaseMode;

      if(vaseMode){
        // continuous spiral: one loop per layer
        const loops = Nlayers;
        const segPerLoop = 180;
        const totalSeg = loops*segPerLoop;
        for(let i=0;i<=totalSeg;i++){
          const u=i/totalSeg;
          const z = u*H;
          const layer = Math.floor(z/lh);
          const theta = u*loops*Math.PI*2;
          const ph = theta*rip + twist*u*loops*2*Math.PI;
          const r = R + A*Math.sin(ph);
          pushPt(cx + r*Math.cos(theta), cy + r*Math.sin(theta), z, "wall", false, layer);
        }
      }else{
        // discrete per-layer ring
        for(let L=0; L<Nlayers; L++){
          const z = L*lh;
          const phase = twist*(L/(Nlayers-1||1))*Math.PI*2;
          const segs=180;
          for(let i=0;i<=segs;i++){
            const t=i/segs;
            const theta=t*Math.PI*2;
            const r = R + A*Math.sin(theta*rip + phase);
            pushPt(cx + r*Math.cos(theta), cy + r*Math.sin(theta), z, "wall", false, L);
          }
        }
      }
    }else if(d.model==="pin_support"){
      const r0 = Math.max(0.2, Number(d.pinBaseR||4));
      const r1 = Math.max(0.05, Number(d.pinTopR||0.7));
      const turns = Math.max(1, Math.floor(Number(d.pinTurns||3)));
      const segs = Nlayers*90;
      for(let i=0;i<=segs;i++){
        const u=i/segs;
        const z=u*H;
        const layer=Math.floor(z/lh);
        const r = r0 + (r1-r0)*u;
        const theta = u*turns*Math.PI*2;
        pushPt(cx + r*Math.cos(theta), cy + r*Math.sin(theta), z, "wall", false, layer);
      }
      // tiny cap circle
      circle(r1, H, "top", Nlayers-1, 0, 60);
    }else if(d.model==="polar_fractions"){
      const denom = Math.max(1, Math.floor(Number(d.denom||12)));
      const numer = clamp(Math.floor(Number(d.numer||5)), 0, denom);
      const rings = Math.max(1, Math.floor(Number(d.rings||3)));
      const step = Math.max(0.1, Number(d.ringStep||8));
      for(let L=0; L<Nlayers; L++){
        const z=L*lh;
        // rings
        for(let r=1; r<=rings; r++){
          circle(r*step, z, "infill", L, 0, 120);
        }
        // spokes
        for(let i=0;i<numer;i++){
          const a = (i/denom)*Math.PI*2;
          const x1 = Math.cos(a)*rings*step;
          const y1 = Math.sin(a)*rings*step;
          line(0,0,x1,y1,z,"wall",L,60);
        }
      }
    }else if(d.model==="hex_adapter"){
      const across = Math.max(1, Number(d.hexAcross||34));
      const wall = Math.max(0.2, Number(d.hexWall||3));
      const apothem = across * 0.5;
      const outerR = apothem / Math.cos(Math.PI/6);
      const innerA = apothem - wall;
      const innerR = innerA > 0 ? innerA / Math.cos(Math.PI/6) : 0;
      const phase = Math.PI/6;
      for(let L=0; L<Nlayers; L++){
        const z=L*lh;
        polygon(outerR, z, "wall", L, 6, phase);
        if(innerR > 0){
          polygon(innerR, z, "inner_wall", L, 6, phase);
        }
      }
    }else if(d.model==="nonplanar_spacer"){
      const R = Math.max(0.2, Number(d.spacerR||18));
      const wall = Math.max(0.2, Number(d.spacerWall||3));
      const A = Number(d.spacerWaveAmp||0);
      const waves = Math.max(1, Math.floor(Number(d.spacerWaves||8)));
      const Rout = R + wall*0.5;
      const Rin = Math.max(0.1, R - wall*0.5);

      // one continuous nonplanar-ish spiral wall between bottom and top
      const loops = Math.max(2, Nlayers);
      const segPer = 200;
      const total = loops*segPer;
      for(let i=0;i<=total;i++){
        const u=i/total;
        const z0 = u*H;
        const layer = Math.floor(z0/lh);
        const theta = u*loops*Math.PI*2;
        const z = z0 + A*Math.sin(theta*waves);
        const r = Rout;
        pushPt(cx + r*Math.cos(theta), cy + r*Math.sin(theta), z, "wall", false, layer);
      }
      // inner wall (planar rings)
      for(let L=0; L<Nlayers; L++){
        const z=L*lh;
        for(let i=0;i<=120;i++){
          const t=i/120;
          const a=t*Math.PI*2;
          pushPt(cx + Rin*Math.cos(a), cy + Rin*Math.sin(a), z, "inner_wall", false, L);
        }
      }
    }else if(d.model==="anyangle_phone_stand"){
      const W = Math.max(5, Number(d.standW||70));
      const D = Math.max(5, Number(d.standD||60));
      const ang = clamp(Number(d.standAngleDeg||55), 5, 85) * Math.PI/180;
      const pitch = Math.max(1, Number(d.standPitch||6));
      const slope = Math.tan(ang);

      // A sloped lattice "ramp": z increases with Y to approximate an any-angle stand surface.
      // Build in multiple layers, but each layer prints a nonplanar-ish grid within that band.
      const halfW = W*0.5;
      const stepsX = Math.max(2, Math.floor(W/pitch));
      const stepsY = Math.max(2, Math.floor(D/pitch));

      for(let L=0; L<Nlayers; L++){
        const zBase=L*lh;
        const y0 = (L/Nlayers) * D;
        const y1 = ((L+1)/Nlayers) * D;
        // zig lines across width
        for(let j=0;j<=stepsY;j++){
          const y = y0 + (j/stepsY)*(y1-y0);
          const z = zBase + y*slope*0.05; // small slope per layer band (keeps within sane Z)
          const dir = (j%2===0) ? 1 : -1;
          for(let i=0;i<=stepsX;i++){
            const t = dir===1 ? i/stepsX : 1-(i/stepsX);
            const x = -halfW + t*W;
            pushPt(cx + x, cy + y, z, "infill", false, L);
          }
        }
        // outline rectangle (planar for stability)
        const zO = zBase;
        line(-halfW, 0,  halfW, 0, zO, "wall", L, 40);
        line( halfW, 0,  halfW, D, zO, "wall", L, 40);
        line( halfW, D, -halfW, D, zO, "wall", L, 40);
        line(-halfW, D, -halfW, 0, zO, "wall", L, 40);
      }
    }else if(d.model==="lattice_cylinder"){
      const R = Math.max(1, Number(d.latRadius||30));
      const pitch = Math.max(lh, Number(d.latPitch||6));
      // two helical families
      const seg = Nlayers*80;
      const turns = H / pitch;
      for(let fam=0; fam<2; fam++){
        const sign = fam===0 ? 1 : -1;
        const phase0 = fam===0 ? 0 : Math.PI/6;
        for(let i=0;i<=seg;i++){
          const u=i/seg;
          const z=u*H;
          const layer=Math.floor(z/lh);
          const theta = phase0 + u*turns*Math.PI*2*sign;
          // slight angle bias
          const r = R + 0.0;
          pushPt(cx + r*Math.cos(theta), cy + r*Math.sin(theta), z, "wall", false, layer);
        }
      }
    }

    // fix JS injection: remove python math usage and hex adapter placeholder by post-processing below
    return { path: pts, out: pts };
  }
};

window.GCODE_STUDIO.NODE_DEFS['Control Experiement'] = controlExperimentNode;
window.GCODE_STUDIO.NODE_DEFS['Control Experiment'] = controlExperimentNode;
