(function(){
const IDEA_NODE_UTILS_KEY = "__GCODE_STUDIO_IDEA_NODE_UTILS__";
const NODE_DEFS_KEY = "__GCODE_STUDIO_NODE_DEFS__";
const sharedNodeDefs = window[NODE_DEFS_KEY] || window.GCODE_STUDIO?.NODE_DEFS || {};
window[NODE_DEFS_KEY] = sharedNodeDefs;

const ensureIdeaUtils = (studio, ideaNodeUtils)=>{
  if(!studio) return;
  if(studio.NODE_DEFS && studio.NODE_DEFS !== sharedNodeDefs){
    Object.assign(sharedNodeDefs, studio.NODE_DEFS);
  }
  studio.NODE_DEFS = sharedNodeDefs;
  studio.IDEA_NODE_UTILS_FALLBACK = studio.IDEA_NODE_UTILS_FALLBACK || ideaNodeUtils;
  studio.IDEA_NODE_UTILS = studio.IDEA_NODE_UTILS || studio.IDEA_NODE_UTILS_FALLBACK;
};

let sharedIdeaNodeUtils =
  window[IDEA_NODE_UTILS_KEY] ||
  window.GCODE_STUDIO?.IDEA_NODE_UTILS ||
  window.GCODE_STUDIO?.IDEA_NODE_UTILS_FALLBACK;

if(!sharedIdeaNodeUtils){
  sharedIdeaNodeUtils = {};
  console.warn("IDEA_NODE_UTILS missing. Load /idea-node-utils.js before node scripts.");
}
window[IDEA_NODE_UTILS_KEY] = sharedIdeaNodeUtils;
let studioRef = window.GCODE_STUDIO || {};
ensureIdeaUtils(studioRef, sharedIdeaNodeUtils);
Object.defineProperty(window, "GCODE_STUDIO", {
  configurable: true,
  get(){
    return studioRef;
  },
  set(next){
    studioRef = next || {};
    ensureIdeaUtils(studioRef, sharedIdeaNodeUtils);
  }
});
window.GCODE_STUDIO = studioRef;
})();
