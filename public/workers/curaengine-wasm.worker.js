importScripts("/wasm/curaengine-loader.js");

const root = typeof window !== "undefined" ? window : self;
const loader = root.GCODE_STUDIO && root.GCODE_STUDIO.loadCuraEngineWasm;

function safeNumber(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildStats(gcode){
  const lines = String(gcode || "").split(/\r?\n/);
  return { lineCount: lines.length };
}

self.onmessage = function(event){
  const data = event.data || {};
  const requestId = data.requestId;
  if(!loader){
    self.postMessage({ status:"error", requestId, error:"CuraEngine WASM loader unavailable." });
    return;
  }
  const mesh = data.mesh;
  const settings = data.settings || {};
  const profile = data.profile || null;

  loader({ wasmUrl: data.wasmUrl, jsUrl: data.jsUrl })
    .then((engine)=>{
      const result = engine.slice(mesh, settings, profile);
      const gcode = result?.gcode || "";
      const stats = result?.stats || buildStats(gcode);
      const warning = result?.warning || null;
      if(!gcode){
        self.postMessage({ status:"error", requestId, error:"No G-code produced by CuraEngine WASM." });
        return;
      }
      self.postMessage({ status:"success", requestId, gcode, stats, warning });
    })
    .catch((err)=>{
      self.postMessage({ status:"error", requestId, error: err?.message || String(err) });
    });
};
