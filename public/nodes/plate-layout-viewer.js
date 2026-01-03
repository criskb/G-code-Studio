window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.IDEA_NODE_UTILS = window.GCODE_STUDIO.IDEA_NODE_UTILS || window.GCODE_STUDIO.IDEA_NODE_UTILS_FALLBACK;
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

const { getBounds } = window.GCODE_STUDIO.IDEA_NODE_UTILS;

function layoutItemsFrom(layout){
  if(!Array.isArray(layout)) return [];
  return layout.map((item, index)=>{
    const bounds = item?.bounds || getBounds(item?.mesh) || null;
    const size = bounds ? {
      w: Math.max(1, bounds.maxx - bounds.minx),
      d: Math.max(1, bounds.maxy - bounds.miny)
    } : { w: 20, d: 20 };
    const transform = item?.transform || {};
    return {
      index,
      x: Number(transform.x || 0),
      y: Number(transform.y || 0),
      rotZ: Number(transform.rotZ || 0),
      w: size.w,
      d: size.d
    };
  });
}

window.GCODE_STUDIO.NODE_DEFS["Plate Layout Viewer"] = {
  title:"Plate Layout Viewer",
  tag:"preview",
  desc:"Visualize layout outputs on a build plate.",
  inputs:[{name:"layout", type:"layout"}],
  outputs:[],
  defaultW: 320,
  defaultH: 320,
  render:(node, mount)=>{
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "layoutViewer";
    const payload = node.runtime?.layoutPayload;
    if(!payload){
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "Connect a layout to preview plate positions.";
      wrap.appendChild(hint);
      mount.appendChild(wrap);
      return;
    }
    const { items, bedW, bedD } = payload;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${bedW} ${bedD}`);
    svg.setAttribute("class", "layoutSvg");

    const bed = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bed.setAttribute("x", "0");
    bed.setAttribute("y", "0");
    bed.setAttribute("width", bedW);
    bed.setAttribute("height", bedD);
    bed.setAttribute("class", "layoutBed");
    svg.appendChild(bed);

    const cx = bedW / 2;
    const cy = bedD / 2;

    items.forEach((item)=>{
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const px = cx + item.x;
      const py = cy + item.y;
      g.setAttribute("transform", `translate(${px} ${py}) rotate(${item.rotZ})`);

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", -item.w/2);
      rect.setAttribute("y", -item.d/2);
      rect.setAttribute("width", item.w);
      rect.setAttribute("height", item.d);
      rect.setAttribute("class", "layoutItem");
      g.appendChild(rect);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "layoutLabel");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");
      label.textContent = String(item.index + 1);
      g.appendChild(label);

      svg.appendChild(g);
    });

    wrap.appendChild(svg);
    mount.appendChild(wrap);
  },
  evaluate:(node, ctx)=>{
    const layout = ctx.getInput(node.id, "layout");
    const items = layoutItemsFrom(layout);
    const profile = ctx.defaultProfile || {};
    const bedW = Number(profile.bedW || 220);
    const bedD = Number(profile.bedD || 220);

    node.runtime = node.runtime || {};
    node.runtime.layoutPayload = items.length ? { items, bedW, bedD } : null;
    return {};
  }
};
