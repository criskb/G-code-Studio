window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};

function normalizeReportPayload(payload){
  if(!payload) return [];
  if(Array.isArray(payload)) return payload.filter(Boolean);
  return [payload];
}

function formatReportValue(value){
  if(value == null) return "-";
  if(typeof value === "number") return Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/,"" ) : String(value);
  if(typeof value === "string") return escapeHtml(value);
  if(Array.isArray(value)) return escapeHtml(value.join(", "));
  if(typeof value === "object") return escapeHtml(JSON.stringify(value));
  return escapeHtml(String(value));
}

function buildReportSection(title, reports){
  if(!reports.length) return `<div class="reportSection muted">No ${title.toLowerCase()} data.</div>`;
  const blocks = reports.map((report)=>{
    const entries = Object.entries(report || {}).filter(([key])=>key !== "title" && key !== "createdAt");
    const rows = entries.map(([key, value])=>`<div class="reportRow"><span>${escapeHtml(key)}</span><span>${formatReportValue(value)}</span></div>`).join("");
    const header = report?.title ? `<div class="reportName">${escapeHtml(report.title)}</div>` : "";
    const created = report?.createdAt ? `<div class="reportMeta">${escapeHtml(report.createdAt)}</div>` : "";
    return `<div class="reportCard">${header}${created}${rows || "<div class='muted'>No details.</div>"}</div>`;
  }).join("");
  return `<div class="reportSection"><div class="reportSectionTitle">${escapeHtml(title)}</div>${blocks}</div>`;
}

window.GCODE_STUDIO.NODE_DEFS["Report Viewer"] = {
  title:"Report Viewer",
  tag:"analysis",
  desc:"Display report, warnings, and stats payloads in-node.",
  inputs:[
    {name:"report", type:"report"},
    {name:"warnings", type:"warnings"},
    {name:"stats", type:"stats"}
  ],
  outputs:[],
  render:(node, mount)=>{
    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "reportViewer";
    const payload = node.runtime?.reportPayload;
    if(!payload){
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "Connect reports to view details.";
      wrap.appendChild(hint);
      mount.appendChild(wrap);
      return;
    }
    const html = [
      buildReportSection("Report", payload.report),
      buildReportSection("Warnings", payload.warnings),
      buildReportSection("Stats", payload.stats)
    ].join("");
    wrap.innerHTML = html;
    mount.appendChild(wrap);
  },
  evaluate:(node, ctx)=>{
    const report = normalizeReportPayload(ctx.getInput(node.id, "report"));
    const warnings = normalizeReportPayload(ctx.getInput(node.id, "warnings"));
    const stats = normalizeReportPayload(ctx.getInput(node.id, "stats"));

    const hasData = report.length || warnings.length || stats.length;
    node.runtime = node.runtime || {};
    node.runtime.reportPayload = hasData ? { report, warnings, stats } : null;
    return {};
  }
};
