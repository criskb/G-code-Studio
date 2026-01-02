window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Rules'] = {
    title:"Rules", tag:"rules",
    uiSchema:SCHEMA_RULES,
  desc:"Per-layer & per-segment expressions: speed(t), flow(t), temp(layer), fan(layer).",
    inputs: [{name:"in", type:"path"}],
    outputs:[{name:"rules", type:"rules"}],
    initData: ()=>({ speedExpr:"printSpeed", flowExpr:"1", enableTemp:false, tempExpr:"nozzleTemp", enableFan:false, fanExpr:"0", layerHeightHint:0.20, injectEveryN:1 }),
    render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
    evaluate:(node, ctx)=>{
      const d=node.data;
      const pmap = ctx.pmap;
      const base = ctx.base;
      let speedFn, flowFn, tempFn, fanFn;
      try { speedFn = compileExpr(d.speedExpr || "printSpeed"); } catch(e){ throw new Error("Rules.speedExpr: "+e.message); }
      try { flowFn  = compileExpr(d.flowExpr  || "1"); } catch(e){ throw new Error("Rules.flowExpr: "+e.message); }
      if(d.enableTemp){ try { tempFn = compileExpr(d.tempExpr || "nozzleTemp"); } catch(e){ throw new Error("Rules.tempExpr: "+e.message); } }
      if(d.enableFan){ try { fanFn = compileExpr(d.fanExpr || "0"); } catch(e){ throw new Error("Rules.fanExpr: "+e.message); } }
      return {
        rules: {
          layerHeightHint: d.layerHeightHint,
          injectEveryN: d.injectEveryN,
          speedFn: (t,i,n,x,y,z,layer)=> Number(speedFn(t,i,n,x,y,z,layer,pmap,base)),
          flowFn:  (t,i,n,x,y,z,layer)=> Number(flowFn (t,i,n,x,y,z,layer,pmap,base)),
          enableTemp: !!d.enableTemp,
          tempFn: tempFn ? ((t,i,n,x,y,z,layer)=> Number(tempFn(t,i,n,x,y,z,layer,pmap,base))) : null,
          enableFan: !!d.enableFan,
          fanFn: fanFn ? ((t,i,n,x,y,z,layer)=> Number(fanFn(t,i,n,x,y,z,layer,pmap,base))) : null,
        }
      };
    }
  };
