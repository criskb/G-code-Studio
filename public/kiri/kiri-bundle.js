const KIRI_CDN_BASE = "https://cdn.jsdelivr.net/gh/GridSpace/grid-apps@master/src";

window.KIRI_MOTO = window.KIRI_MOTO || {};
window.KIRI_MOTO.workerUrl = `${KIRI_CDN_BASE}/kiri/run/worker.js`;
window.KIRI_MOTO.poolUrl = `${KIRI_CDN_BASE}/kiri/run/minion.js`;

window.KIRI_MOTO.loadEngine = async () => {
  if (window.KIRI_MOTO.Engine) return window.KIRI_MOTO.Engine;
  const mod = await import(`${KIRI_CDN_BASE}/kiri/run/engine.js`);
  window.KIRI_MOTO.Engine = mod.Engine;
  return window.KIRI_MOTO.Engine;
};
