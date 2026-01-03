window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Vase (Control Points)'] = {
  title:"Vase (Control Points)",
  tag:"generator",
  desc:"Design a vase by editing radius-vs-height control points. Outputs a revolved mesh (and optional spiral wall path).",
  inputs:[{name:"profile", type:"profile"}],
  outputs:[{name:"mesh", type:"mesh"},{name:"path", type:"path"}],
  initData:()=>({
    height:140,
    baseRadius:35,
    wall:1.2,
    segments:160,
    // profile control points (u in 0..1, r multiplier)
    points:[
      {u:0.0, r:1.0, type:"smooth", hInU:-0.05, hInR:0.0, hOutU:0.05, hOutR:0.0},
      {u:0.15, r:1.05, type:"smooth", hInU:-0.05, hInR:0.0, hOutU:0.05, hOutR:0.0},
      {u:0.45, r:0.9, type:"smooth", hInU:-0.05, hInR:0.0, hOutU:0.05, hOutR:0.0},
      {u:0.75, r:1.12, type:"smooth", hInU:-0.05, hInR:0.0, hOutU:0.05, hOutR:0.0},
      {u:1.0, r:0.85, type:"smooth", hInU:-0.05, hInR:0.0, hOutU:0.05, hOutR:0.0}
    ],
    smooth:0.35,
    bedAlign:true,
    linkHandles:true,
    // spiral wall
    outputSpiralPath:true,
    layerHeight:0.24,
    turnsPerLayer:1.0,
    twistDeg:0,
  }),
  render:(node, mount)=>{
    const d=node.data;
    mount.innerHTML="";
    // preview pad 2:3
    const pad=document.createElement("div");
    pad.className="imgNodePreview";
    pad.style.aspectRatio="2 / 3";
    const c=document.createElement("canvas");
    c.width=420; c.height=630;
    pad.appendChild(c);
    mount.appendChild(pad);

    function normalizePoint(p){
      if(!p) return {u:0, r:1, type:"smooth", hInU:0, hInR:0, hOutU:0, hOutR:0};
      if(!p.type) p.type = "smooth";
      if(!Number.isFinite(p.hInU)) p.hInU = -0.05;
      if(!Number.isFinite(p.hOutU)) p.hOutU = 0.05;
      if(!Number.isFinite(p.hInR)) p.hInR = 0;
      if(!Number.isFinite(p.hOutR)) p.hOutR = 0;
      return p;
    }

    function draw(){
      const ctx=c.getContext("2d");
      const W=c.width, H=c.height;
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle="rgba(255,255,255,0.04)";
      ctx.fillRect(0,0,W,H);

      // plot area with padding
      const px=18, py=18;
      const gx=px, gy=py, gw=W-2*px, gh=H-2*py;
      ctx.strokeStyle="rgba(255,255,255,0.18)";
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.rect(gx,gy,gw,gh);
      ctx.stroke();

      // axes labels
      ctx.fillStyle="rgba(255,255,255,0.55)";
      ctx.font="12px ui-sans-serif";
      ctx.fillText("Radius →", gx+8, gy+16);
      ctx.save();
      ctx.translate(gx+6, gy+gh-10);
      ctx.rotate(-Math.PI/2);
      ctx.fillText("Height ↑", 0,0);
      ctx.restore();

      // curve
      const pts = (d.points||[]).map(normalizePoint).slice().sort((a,b)=>a.u-b.u);
      const toXY=(p)=>{
        const x = gx + (p.r*0.9)*gw; // r roughly 0..1.4
        const y = gy + (1-p.u)*gh;
        return {x,y};
      };

      // sample smooth curve
      ctx.strokeStyle="rgba(0,255,160,0.85)";
      ctx.lineWidth=2;
      ctx.beginPath();
      const N=140;
      for(let i=0;i<=N;i++){
        const u=i/N;
        const r = evalProfile(u, pts, d.smooth||0);
        const x = gx + (r*0.9)*gw;
        const y = gy + (1-u)*gh;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();

      // control points
      for(let i=0;i<pts.length;i++){
        const p=pts[i];
        const q=toXY(p);
        if(p.type === "smooth"){
          const inHandle = toXY({u: p.u + p.hInU, r: p.r + p.hInR});
          const outHandle = toXY({u: p.u + p.hOutU, r: p.r + p.hOutR});
          ctx.strokeStyle="rgba(0,255,160,0.35)";
          ctx.lineWidth=1;
          ctx.beginPath();
          ctx.moveTo(inHandle.x, inHandle.y);
          ctx.lineTo(q.x, q.y);
          ctx.lineTo(outHandle.x, outHandle.y);
          ctx.stroke();

          ctx.fillStyle="rgba(0,255,160,0.65)";
          ctx.beginPath(); ctx.arc(inHandle.x, inHandle.y, 4, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(outHandle.x, outHandle.y, 4, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle="rgba(0,255,160,0.9)";
        ctx.beginPath(); ctx.arc(q.x,q.y,6,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(0,0,0,0.35)";
        ctx.stroke();
        if(i === (d.selectedIndex ?? -1)){
          ctx.strokeStyle="rgba(255,255,255,0.9)";
          ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(q.x,q.y,8,0,Math.PI*2); ctx.stroke();
        }
      }

      ctx.fillStyle="rgba(255,255,255,0.55)";
      ctx.font="11px ui-sans-serif";
      ctx.fillText("Drag points. Double-click to add. Right-click a point to delete.", gx+8, gy+gh-10);
    }

    function evalProfile(u, pts, smooth){
      // piecewise linear, then a tiny smoothing (Catmull-ish by blending)
      if(!pts.length) return 1.0;
      if(u<=pts[0].u) return pts[0].r;
      if(u>=pts[pts.length-1].u) return pts[pts.length-1].r;
      let i=1;
      for(; i<pts.length; i++){
        if(u<=pts[i].u) break;
      }
      const p0=normalizePoint(pts[i-1]), p1=normalizePoint(pts[i]);
      const t=(u-p0.u)/Math.max(1e-9,(p1.u-p0.u));
      let r = p0.r + (p1.r-p0.r)*t;

      const s = clamp(Number(smooth||0), 0, 1);
      const pPrev = normalizePoint(pts[Math.max(0,i-2)]);
      const pNext = normalizePoint(pts[Math.min(pts.length-1,i+1)]);
      const rHermite = cubicHermite(u, pPrev, p0, p1, pNext);
      const hasHandles = hasHandle(p0) || hasHandle(p1);
      if(hasHandles){
        r = rHermite;
      }else if(s>0){
        r = r*(1-s) + rHermite*s;
      }
      return clamp(r, 0.05, 2.0);
    }
    function cubicHermite(u, pPrev, p0, p1, pNext){
      if((p0.type === "sharp" || p1.type === "sharp") && !hasHandle(p0) && !hasHandle(p1)){
        const t = (u-p0.u)/Math.max(1e-9,(p1.u-p0.u));
        return p0.r + (p1.r - p0.r) * t;
      }
      // Map u to segment space
      const t = (u-p0.u)/Math.max(1e-9,(p1.u-p0.u));
      const m0 = handleSlope(p0, pPrev, p1, "out");
      const m1 = handleSlope(p1, p0, pNext, "in");
      const h00 = (2*t*t*t - 3*t*t + 1);
      const h10 = (t*t*t - 2*t*t + t);
      const h01 = (-2*t*t*t + 3*t*t);
      const h11 = (t*t*t - t*t);
      const du = (p1.u - p0.u);
      return h00*p0.r + h10*m0*du + h01*p1.r + h11*m1*du;
    }
    function handleSlope(p, pPrev, pNext, dir){
      const uOff = dir === "out" ? p.hOutU : p.hInU;
      const rOff = dir === "out" ? p.hOutR : p.hInR;
      if(Number.isFinite(uOff) && Math.abs(uOff) > 1e-6){
        return rOff / uOff;
      }
      const du = (pNext.u - pPrev.u);
      if(Math.abs(du) < 1e-6) return 0;
      return (pNext.r - pPrev.r) / du;
    }
    function hasHandle(p){
      return Math.abs(p.hInU) > 1e-6 || Math.abs(p.hInR) > 1e-6
        || Math.abs(p.hOutU) > 1e-6 || Math.abs(p.hOutR) > 1e-6;
    }

    function getPtsSorted(){ return (d.points||[]).map(normalizePoint).slice().sort((a,b)=>a.u-b.u); }

    // interaction: drag
    let dragIndex=-1;
    let dragHandle=null;
    const hitRadius=10;
    function pickPoint(mx,my){
      const pts=getPtsSorted();
      const px=18, py=18;
      const gx=px, gy=py, gw=c.width-2*px, gh=c.height-2*py;
      const toXY=(p)=>({x: gx + (p.r*0.9)*gw, y: gy + (1-p.u)*gh});
      for(let i=0;i<pts.length;i++){
        const p = pts[i];
        if(p.type !== "smooth") continue;
        const inHandle = toXY({u: p.u + p.hInU, r: p.r + p.hInR});
        const outHandle = toXY({u: p.u + p.hOutU, r: p.r + p.hOutR});
        const din = (mx-inHandle.x)*(mx-inHandle.x) + (my-inHandle.y)*(my-inHandle.y);
        const dout = (mx-outHandle.x)*(mx-outHandle.x) + (my-outHandle.y)*(my-outHandle.y);
        if(din < hitRadius*hitRadius) return { index: d.points.findIndex(p2=>p2.u===p.u && p2.r===p.r), handle: "in" };
        if(dout < hitRadius*hitRadius) return { index: d.points.findIndex(p2=>p2.u===p.u && p2.r===p.r), handle: "out" };
      }
      let best=-1, bd=1e9;
      for(let i=0;i<pts.length;i++){
        const q=toXY(pts[i]);
        const dx=mx-q.x, dy=my-q.y;
        const dd=dx*dx+dy*dy;
        if(dd<bd && dd<hitRadius*hitRadius){ bd=dd; best=i; }
      }
      if(best<0) return -1;
      // map to original array index (by unique u+r)
      const orig = d.points.findIndex(p=>p.u===pts[best].u && p.r===pts[best].r);
      return { index: (orig>=0 ? orig : best), handle: "point" };
    }
    function canvasToUR(mx,my){
      const px=18, py=18;
      const gx=px, gy=py, gw=c.width-2*px, gh=c.height-2*py;
      const rr = clamp((mx-gx)/gw, 0, 1) / 0.9;
      const uu = clamp(1-((my-gy)/gh), 0, 1);
      return {u:uu, r:rr};
    }

    c.addEventListener("mousedown", (e)=>{
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const hit=pickPoint(mx,my);
      if(hit && hit.index>=0){
        dragIndex=hit.index;
        dragHandle=hit.handle;
        d.selectedIndex = hit.index;
        e.preventDefault();
        draw();
      }
    });
    window.addEventListener("mousemove", (e)=>{
      if(dragIndex<0) return;
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const ur=canvasToUR(mx,my);
      const p = normalizePoint(d.points[dragIndex]);
      if(dragHandle === "point"){
        p.u = ur.u;
        p.r = ur.r;
      }else if(dragHandle === "in"){
        p.hInU = ur.u - p.u;
        p.hInR = ur.r - p.r;
        if(d.linkHandles){
          p.hOutU = -p.hInU;
          p.hOutR = -p.hInR;
        }
      }else if(dragHandle === "out"){
        p.hOutU = ur.u - p.u;
        p.hOutR = ur.r - p.r;
        if(d.linkHandles){
          p.hInU = -p.hOutU;
          p.hInR = -p.hOutR;
        }
      }
      saveState(); markDirtyAuto(); draw();
    });
    window.addEventListener("mouseup", ()=>{ dragIndex=-1; dragHandle=null; });

    c.addEventListener("dblclick", (e)=>{
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const ur=canvasToUR(mx,my);
      d.points.push({u:ur.u, r:ur.r, type:"smooth", hInU:-0.05, hInR:0, hOutU:0.05, hOutR:0});
      saveState(); markDirtyAuto(); draw();
    });
    c.addEventListener("contextmenu", (e)=>{
      e.preventDefault();
      const rect=c.getBoundingClientRect();
      const mx=(e.clientX-rect.left)*(c.width/rect.width);
      const my=(e.clientY-rect.top)*(c.height/rect.height);
      const hit=pickPoint(mx,my);
      if(hit && hit.index>=0 && (d.points||[]).length>2){
        d.points.splice(hit.index,1);
        saveState(); markDirtyAuto(); draw();
      }
    });

    mount.appendChild(dividerTiny());
    mount.appendChild(field("Height (mm)", elNumber(d.height??140, v=>{ d.height=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Base radius (mm)", elNumber(d.baseRadius??35, v=>{ d.baseRadius=v; markDirtyAuto(); saveState(); }, 0.1)));
    mount.appendChild(field("Wall (mm)", elNumber(d.wall??1.2, v=>{ d.wall=v; markDirtyAuto(); saveState(); }, 0.05)));
    mount.appendChild(field("Revolve segments", elNumber(d.segments??160, v=>{ d.segments=v; markDirtyAuto(); saveState(); }, 1)));
    mount.appendChild(field("Smooth", elNumber(d.smooth??0.35, v=>{ d.smooth=v; markDirtyAuto(); saveState(); draw(); }, 0.01)));
    mount.appendChild(field("Bed align", elToggle(!!d.bedAlign, v=>{ d.bedAlign=!!v; markDirtyAuto(); saveState(); })));
    mount.appendChild(field("Link handles", elToggle(d.linkHandles!==false, v=>{ d.linkHandles=!!v; markDirtyAuto(); saveState(); })));

    const selectedIndex = Number.isFinite(d.selectedIndex) ? d.selectedIndex : -1;
    const selectedPoint = (selectedIndex >= 0 && d.points[selectedIndex]) ? normalizePoint(d.points[selectedIndex]) : null;
    const selLabel = document.createElement("div");
    selLabel.className = "hint";
    selLabel.textContent = selectedPoint ? `Selected point #${selectedIndex + 1}` : "Select a control point to edit handles.";
    mount.appendChild(selLabel);
    if(selectedPoint){
      const typeWrap = document.createElement("div");
      typeWrap.className = "miniRow";
      const smoothBtn = document.createElement("button");
      smoothBtn.className = "btn";
      smoothBtn.textContent = "Smooth";
      smoothBtn.style.opacity = selectedPoint.type === "smooth" ? "1" : "0.6";
      smoothBtn.addEventListener("click", ()=>{
        selectedPoint.type = "smooth";
        saveState(); markDirtyAuto(); draw(); refreshNodeContent(node.id);
      });
      const sharpBtn = document.createElement("button");
      sharpBtn.className = "btn";
      sharpBtn.textContent = "Sharp";
      sharpBtn.style.opacity = selectedPoint.type === "sharp" ? "1" : "0.6";
      sharpBtn.addEventListener("click", ()=>{
        selectedPoint.type = "sharp";
        saveState(); markDirtyAuto(); draw(); refreshNodeContent(node.id);
      });
      typeWrap.appendChild(smoothBtn);
      typeWrap.appendChild(sharpBtn);
      mount.appendChild(field("Point type", typeWrap));
      mount.appendChild(grid2([
        field("Handle in U", elNumber(selectedPoint.hInU, v=>{ selectedPoint.hInU=v; if(d.linkHandles){ selectedPoint.hOutU=-v; } saveState(); markDirtyAuto(); draw(); }, 0.01)),
        field("Handle in R", elNumber(selectedPoint.hInR, v=>{ selectedPoint.hInR=v; if(d.linkHandles){ selectedPoint.hOutR=-v; } saveState(); markDirtyAuto(); draw(); }, 0.01))
      ]));
      mount.appendChild(grid2([
        field("Handle out U", elNumber(selectedPoint.hOutU, v=>{ selectedPoint.hOutU=v; if(d.linkHandles){ selectedPoint.hInU=-v; } saveState(); markDirtyAuto(); draw(); }, 0.01)),
        field("Handle out R", elNumber(selectedPoint.hOutR, v=>{ selectedPoint.hOutR=v; if(d.linkHandles){ selectedPoint.hInR=-v; } saveState(); markDirtyAuto(); draw(); }, 0.01))
      ]));
    }

    mount.appendChild(dividerTiny());
    mount.appendChild(field("Output spiral wall path", elToggle(!!d.outputSpiralPath, v=>{ d.outputSpiralPath=!!v; markDirtyAuto(); saveState(); })));
    if(d.outputSpiralPath){
      mount.appendChild(field("Layer height", elNumber(d.layerHeight??0.24, v=>{ d.layerHeight=v; markDirtyAuto(); saveState(); }, 0.01)));
      mount.appendChild(field("Turns per layer", elNumber(d.turnsPerLayer??1.0, v=>{ d.turnsPerLayer=v; markDirtyAuto(); saveState(); }, 0.05)));
      mount.appendChild(field("Twist (deg)", elNumber(d.twistDeg??0, v=>{ d.twistDeg=v; markDirtyAuto(); saveState(); }, 1)));
    }

    // expose eval for draw
    node.runtime = node.runtime || {};
    node.runtime._evalProfile = (u)=>evalProfile(u, getPtsSorted(), d.smooth||0);
    draw();
  },
  evaluate:(node, ctx)=>{
    const d=node.data;
    const H = Math.max(1, Number(d.height||140));
    const R0 = Math.max(1, Number(d.baseRadius||35));
    const wall = Math.max(0.4, Number(d.wall||1.2));
    const seg = Math.max(24, Math.floor(Number(d.segments||160)));
    const pts = (d.points||[]).slice().sort((a,b)=>a.u-b.u);
    const prof = (node.runtime && node.runtime._evalProfile) ? node.runtime._evalProfile : ((u)=>1.0);

    // Build revolved surface (outer + inner)
    const tris=[];
    const addTri=(ax,ay,az,bx,by,bz,cx,cy,cz)=>{ tris.push(ax,ay,az,bx,by,bz,cx,cy,cz); };

    const rings = Math.max(2, Math.floor(H / 1.0)+2);
    for(let j=0;j<rings-1;j++){
      const u0=j/(rings-1), u1=(j+1)/(rings-1);
      const z0=u0*H, z1=u1*H;
      const rO0 = R0 * prof(u0);
      const rO1 = R0 * prof(u1);
      const rI0 = Math.max(0.1, rO0 - wall);
      const rI1 = Math.max(0.1, rO1 - wall);

      for(let i=0;i<seg;i++){
        const t0=i/seg, t1=(i+1)/seg;
        const a0=t0*Math.PI*2, a1=t1*Math.PI*2;
        const c0=Math.cos(a0), s0=Math.sin(a0);
        const c1=Math.cos(a1), s1=Math.sin(a1);

        // outer quad (two tris)
        const x00=rO0*c0, y00=rO0*s0;
        const x10=rO0*c1, y10=rO0*s1;
        const x01=rO1*c0, y01=rO1*s0;
        const x11=rO1*c1, y11=rO1*s1;
        addTri(x00,y00,z0, x10,y10,z0, x01,y01,z1);
        addTri(x10,y10,z0, x11,y11,z1, x01,y01,z1);

        // inner quad (flip winding)
        const xi00=rI0*c0, yi00=rI0*s0;
        const xi10=rI0*c1, yi10=rI0*s1;
        const xi01=rI1*c0, yi01=rI1*s0;
        const xi11=rI1*c1, yi11=rI1*s1;
        addTri(xi00,yi00,z0, xi01,yi01,z1, xi10,yi10,z0);
        addTri(xi10,yi10,z0, xi01,yi01,z1, xi11,yi11,z1);
      }
    }

    // bottom cap
    {
      const z=0;
      const rO=R0*prof(0);
      const rI=Math.max(0.1, rO-wall);
      for(let i=0;i<seg;i++){
        const a0=(i/seg)*Math.PI*2, a1=((i+1)/seg)*Math.PI*2;
        const c0=Math.cos(a0), s0=Math.sin(a0);
        const c1=Math.cos(a1), s1=Math.sin(a1);
        // ring cap between rI and rO
        addTri(rI*c0,rI*s0,z, rO*c1,rO*s1,z, rO*c0,rO*s0,z);
        addTri(rI*c0,rI*s0,z, rI*c1,rI*s1,z, rO*c1,rO*s1,z);
      }
    }

    // Convert to mesh struct
    const arr = new Float32Array(tris);
    let mesh = { tris: arr, triCount: Math.floor(arr.length/9), bounds: computeMeshBounds(arr), index:null };
    if(d.bedAlign) mesh = bedAlignMesh(mesh);

    // Optional spiral path (single wall)
    let path = [];
    if(d.outputSpiralPath){
      const lh = Math.max(0.01, Number(d.layerHeight||0.24));
      const layers = Math.max(1, Math.ceil(H/lh));
      const turnsPerLayer = Math.max(0.1, Number(d.turnsPerLayer||1.0));
      const twist = (Number(d.twistDeg||0)*Math.PI/180);
      const segPerTurn=180;
      const totalSeg = layers*turnsPerLayer*segPerTurn;
      for(let k=0;k<=totalSeg;k++){
        const u=k/Math.max(1,totalSeg);
        const z=u*H;
        const layer=Math.floor(z/lh);
        const theta = u*(layers*turnsPerLayer)*Math.PI*2 + twist*u;
        const rr = R0*prof(u);
        const X = rr*Math.cos(theta);
        const Y = rr*Math.sin(theta);
        path.push({X,Y,z,role:"wall",travel:false,layer});
      }
    }

    return { mesh, path, outMesh:mesh, outPath:path };
  }
};
