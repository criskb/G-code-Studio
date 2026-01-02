window.GCODE_STUDIO = window.GCODE_STUDIO || {};
window.GCODE_STUDIO.NODE_DEFS = window.GCODE_STUDIO.NODE_DEFS || {};
window.GCODE_STUDIO.NODE_DEFS['Printer'] = {
    title:"Printer", tag:"machine",
    uiSchema:SCHEMA_PRINTER,
  desc:"Bed, origin, filament, line width, start/end G-code.",
    inputs: [], outputs:[{name:"profile", type:"profile"}],
    initData: ()=>({
      name:"Generic FDM",
      bedW:220, bedD:220, bedH:250,
      origin:"center",
      offsetX:0, offsetY:0,
      travelZ:5,
      nozzle:0.4,
      lineWidth:0.45,
      filamentDia:1.75,
      extrusionMult:1.0,
      tempNozzle:210,
      tempBed:60,
      speedPrint:1800,
      speedTravel:6000,
      startGcode:`M104 S210
M140 S60
G28
G92 E0`,
      endGcode:`M104 S0
M140 S0
G28 X0
M84`
    }),
    render:(node, mount)=>renderSchema(NODE_DEFS[node.type].uiSchema, node, mount),
    evaluate:(node)=>({ profile: {...node.data} })
  };
