(function(){
  const root = typeof window !== "undefined" ? window : self;
  root.GCODE_STUDIO = root.GCODE_STUDIO || {};

  const LOADER_KEY = "__curaengineWasmLoader";

  function loadScriptOnce(src){
    if(!root.document) return Promise.resolve();
    if(root.document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject)=>{
      const script = root.document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = ()=>resolve();
      script.onerror = ()=>reject(new Error(`Failed to load ${src}`));
      root.document.head.appendChild(script);
    });
  }

  function numberOr(value, fallback){
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function fallbackSlice(meshPayload, settings, profile){
    const bounds = meshPayload?.bounds || { minx:0, miny:0, minz:0, maxx:20, maxy:20, maxz:0 };
    const minx = numberOr(bounds.minx, 0);
    const miny = numberOr(bounds.miny, 0);
    const maxx = numberOr(bounds.maxx, minx + 20);
    const maxy = numberOr(bounds.maxy, miny + 20);
    const layerHeight = Math.max(0.05, numberOr(settings?.layerHeight, 0.2));
    const z = numberOr(bounds.minz, 0) + layerHeight;
    const feed = Math.max(300, numberOr(settings?.printSpeed, 1800));
    const travel = Math.max(600, numberOr(settings?.travelSpeed, 3600));
    const lines = [
      "; CuraEngine WASM fallback output",
      "G90",
      "M82",
      "G92 E0",
      `G0 F${travel.toFixed(0)} X${minx.toFixed(3)} Y${miny.toFixed(3)} Z${z.toFixed(3)}`,
      `G1 F${feed.toFixed(0)} X${maxx.toFixed(3)} Y${miny.toFixed(3)} E1.0`,
      `G1 X${maxx.toFixed(3)} Y${maxy.toFixed(3)} E2.0`,
      `G1 X${minx.toFixed(3)} Y${maxy.toFixed(3)} E3.0`,
      `G1 X${minx.toFixed(3)} Y${miny.toFixed(3)} E4.0`,
      "G92 E0",
      "; END"
    ];
    return { gcode: lines.join("\n"), stats: { source:"fallback", profileUsed: !!profile } };
  }

  async function instantiateWasm(wasmUrl){
    try{
      if(WebAssembly.instantiateStreaming){
        const response = await fetch(wasmUrl);
        if(!response.ok) throw new Error(`Failed to fetch ${wasmUrl}`);
        return await WebAssembly.instantiateStreaming(response, {});
      }
    }catch(err){
      // Fall back to ArrayBuffer path below.
    }
    const buffer = await fetch(wasmUrl).then((resp)=>{
      if(!resp.ok) throw new Error(`Failed to fetch ${wasmUrl}`);
      return resp.arrayBuffer();
    });
    return WebAssembly.instantiate(buffer, {});
  }

  root.GCODE_STUDIO.curaengineFallbackSlice = fallbackSlice;

  root.GCODE_STUDIO.loadCuraEngineWasm = function loadCuraEngineWasm(options){
    if(root.GCODE_STUDIO[LOADER_KEY]) return root.GCODE_STUDIO[LOADER_KEY];
    const opts = options || {};
    root.GCODE_STUDIO[LOADER_KEY] = (async ()=>{
      const wasmUrl = opts.wasmUrl || "/wasm/curaengine.wasm";
      const jsUrl = opts.jsUrl || "/wasm/curaengine.js";
      try{
        await loadScriptOnce(jsUrl);
      }catch(_){
        // Non-fatal; wasm may still be loaded directly.
      }
      let instance = null;
      let exports = null;
      try{
        const result = await instantiateWasm(wasmUrl);
        instance = result.instance;
        exports = instance.exports || null;
      }catch(err){
        return { instance:null, exports:null, slice: (mesh, settings, profile)=>fallbackSlice(mesh, settings, profile), error: err?.message || String(err) };
      }
      const slice = (mesh, settings, profile)=>{
        if(exports && typeof exports.curaengine_slice === "function"){
          try{
            return exports.curaengine_slice(mesh, settings, profile);
          }catch(_){
            return fallbackSlice(mesh, settings, profile);
          }
        }
        return fallbackSlice(mesh, settings, profile);
      };
      return { instance, exports, slice, error:null };
    })();
    return root.GCODE_STUDIO[LOADER_KEY];
  };
})();
