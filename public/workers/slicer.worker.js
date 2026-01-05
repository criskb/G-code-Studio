self.onmessage = function(e){
  const d = e.data || {};
  const v = d.vertices;
  const ind = d.indices;
  const s = d.settings || {};
  const lh = Math.max(0.05, Number(s.layerHeight||0.2));
  if(!v || v.length<9) return self.postMessage({ status:"error", message:"no vertices" });
  const nInd = ind && ind.length ? ind : null;
  let minZ=Infinity, maxZ=-Infinity;
  for(let i=2;i<v.length;i+=3){
    const z=v[i];
    if(z<minZ) minZ=z;
    if(z>maxZ) maxZ=z;
  }
  const layers=[];
  const link = (segs)=>{
    const paths=[]; const pool=segs.slice();
    while(pool.length){
      const cur=[pool.pop()];
      let head=[cur[0][2],cur[0][3]]; let tail=[cur[0][0],cur[0][1]];
      let merged=true;
      while(merged){
        merged=false;
        for(let i=0;i<pool.length;i++){
          const s=pool[i];
          const p1=[s[0],s[1]], p2=[s[2],s[3]];
          const d1=Math.hypot(p1[0]-head[0], p1[1]-head[1]);
          const d2=Math.hypot(p2[0]-head[0], p2[1]-head[1]);
          const d3=Math.hypot(p1[0]-tail[0], p1[1]-tail[1]);
          const d4=Math.hypot(p2[0]-tail[0], p2[1]-tail[1]);
          if(d1<1e-3){ head=p2; cur.push(s); pool.splice(i,1); merged=true; break; }
          else if(d2<1e-3){ head=p1; cur.push([s[2],s[3], s[0],s[1]]); pool.splice(i,1); merged=true; break; }
          else if(d3<1e-3){ tail=p2; cur.unshift(s); pool.splice(i,1); merged=true; break; }
          else if(d4<1e-3){ tail=p1; cur.unshift([s[2],s[3], s[0],s[1]]); pool.splice(i,1); merged=true; break; }
        }
      }
      paths.push(cur);
    }
    return paths;
  };
  const intersectTri = (ax,ay,az, bx,by,bz, cx,cy,cz, z)=>{
    const pts=[];
    const edge=(px,py,pz, qx,qy,qz)=>{
      const dz=qz-pz; if(Math.abs(dz)<1e-9) return;
      const t=(z-pz)/dz; if(t<-1e-9||t>1+1e-9) return;
      const x=px+(qx-px)*t; const y=py+(qy-py)*t; pts.push([x,y]);
    };
    const minz=Math.min(az,bz,cz), maxz=Math.max(az,bz,cz);
    if(z<minz-1e-9||z>maxz+1e-9) return null;
    edge(ax,ay,az, bx,by,bz);
    edge(bx,by,bz, cx,cy,cz);
    edge(cx,cy,cz, ax,ay,az);
    if(pts.length<2) return null;
    let p0=pts[0], p1=pts[1];
    if(pts.length>2){
      let best=[p0,p1], bestD=-1;
      for(let a=0;a<pts.length;a++){
        for(let b=a+1;b<pts.length;b++){
          const dx=pts[a][0]-pts[b][0], dy=pts[a][1]-pts[b][1];
          const d=dx*dx+dy*dy; if(d>bestD){ bestD=d; best=[pts[a],pts[b]]; }
        }
      }
      p0=best[0]; p1=best[1];
    }
    const dx=p0[0]-p1[0], dy=p0[1]-p1[1];
    if(dx*dx+dy*dy<1e-12) return null;
    return [p0[0],p0[1], p1[0],p1[1]];
  };
  for(let z=minZ; z<=maxZ+1e-9; z+=lh){
    const segs=[];
    if(nInd){
      for(let i=0;i<nInd.length;i+=3){
        const i1=nInd[i], i2=nInd[i+1], i3=nInd[i+2];
        const ax=v[i1*3], ay=v[i1*3+1], az=v[i1*3+2];
        const bx=v[i2*3], by=v[i2*3+1], bz=v[i2*3+2];
        const cx=v[i3*3], cy=v[i3*3+1], cz=v[i3*3+2];
        const sgm=intersectTri(ax,ay,az, bx,by,bz, cx,cy,cz, z);
        if(sgm) segs.push(sgm);
      }
    }else{
      for(let i=0;i<v.length;i+=9){
        const ax=v[i], ay=v[i+1], az=v[i+2];
        const bx=v[i+3], by=v[i+4], bz=v[i+5];
        const cx=v[i+6], cy=v[i+7], cz=v[i+8];
        const sgm=intersectTri(ax,ay,az, bx,by,bz, cx,cy,cz, z);
        if(sgm) segs.push(sgm);
      }
    }
    if(!segs.length) continue;
    const paths=link(segs);
    layers.push({ z, segments: segs, paths });
    if(layers.length>1000) break;
  }
  self.postMessage({ status:"success", layers });
};