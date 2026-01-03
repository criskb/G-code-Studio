window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function normalizePlan(payload){
  if(!payload) return null;
  if(typeof payload !== "object") return { value: payload };
  return payload;
}

function formatPlanRows(plan){
  if(!plan) return "";
  const entries = Object.entries(plan).filter(([key])=>key !== "createdAt");
  return entries.map(([key, value])=>`<div class="reportRow"><span>${escapeHtml(key)}</span><span>${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</span></div>`).join("");
}

function overlaySummary(overlays){
  if(!overlays) return "";
  if(Array.isArray(overlays)) return overlays.map((item)=>String(item)).join(", ");
  if(typeof overlays === "object") return Object.keys(overlays).join(", ");
  return String(overlays);
}

function buildPlanBlock(label, plan){
  if(!plan) return `<div class="reportSection muted">No ${label.toLowerCase()} provided.</div>`;
  const title = plan.id ? `${label}: ${plan.id}` : label;
  const created = plan.createdAt ? `<div class="reportMeta">${escapeHtml(plan.createdAt)}</div>` : "";
  const rows = formatPlanRows(plan);
  return `<div class="reportSection"><div class="reportSectionTitle">${escapeHtml(title)}</div>${created}${rows || "<div class='muted'>No fields.</div>"}</div>`;
}

window.GCODE_STUDIO.NODE_DEFS["Plan/Overlay Viewer"] = {
  title:"Plan/Overlay Viewer",
  tag:"analysis",
  desc:"Summarize plate/tool/purge plans, hints, and overlay metadata.",
  inputs:[
    {name:"platePlan", type:"json"},
    {name:"toolPlan", type:"json"},
    {name:"purgePlan", type:"json"},
    {name:"hints", type:"json"},
    {name:"overlays", type:"json"}
  ],
  outputs:[],
  render:(node, mount)=>{
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "reportViewer";
    const payload = node.runtime?.planPayload;
    if(!payload){
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "Connect plans or overlays to inspect their metadata.";
      wrap.appendChild(hint);
      mount.appendChild(wrap);
      return;
    }
    const { platePlan, toolPlan, purgePlan, hints, overlays } = payload;
    const overlayLine = overlays ? `<div class="reportSection"><div class="reportSectionTitle">Overlays</div><div class="reportRow"><span>Keys</span><span>${escapeHtml(overlaySummary(overlays) || "-")}</span></div></div>` : "";
    wrap.innerHTML = [
      buildPlanBlock("Plate plan", platePlan),
      buildPlanBlock("Tool plan", toolPlan),
      buildPlanBlock("Purge plan", purgePlan),
      buildPlanBlock("Hints", hints),
      overlayLine
    ].join("");
    mount.appendChild(wrap);
  },
  evaluate:(node, ctx)=>{
    const platePlan = normalizePlan(ctx.getInput(node.id, "platePlan"));
    const toolPlan = normalizePlan(ctx.getInput(node.id, "toolPlan"));
    const purgePlan = normalizePlan(ctx.getInput(node.id, "purgePlan"));
    const hints = normalizePlan(ctx.getInput(node.id, "hints"));
    const overlays = ctx.getInput(node.id, "overlays");

    const hasData = platePlan || toolPlan || purgePlan || hints || overlays;
    node.runtime = node.runtime || {};
    node.runtime.planPayload = hasData ? { platePlan, toolPlan, purgePlan, hints, overlays } : null;
    return {};
  }
};
