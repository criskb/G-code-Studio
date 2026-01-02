# G-code Studio Reader

## Overview
G-code Studio is a node-graph workspace for building toolpaths, rules, and printer output in a FullControl-inspired workflow. It combines a searchable node library, a graph canvas, and a preview panel so you can move from SVG or mesh inputs to G-code exports in one flow.

![G-code Studio settings overlay](reader-assets/settings-overview.svg)

## Quick start
1. Launch the app (served by `server.js`).
2. Press **Space** to open the node picker and add nodes.
3. Wire nodes from left to right: **Path → Modifiers → Rules → Printer → Export**.
4. Click **Run graph** to generate toolpaths and preview them.
5. Use **Download .gcode** to export the output.

## Settings
Open **Settings** in the top bar to personalize the workspace.

### Layout & picker behavior
- **Show Node Library sidebar** toggles the left panel.
- **Space opens Node Picker** enables the quick-add menu.
- **Open picker while typing** allows Space to open the picker even when a text input is active.
- **Picker delay** adjusts the key-hold delay before opening the picker.
- **Spawn at cursor** controls whether nodes appear under your pointer or in the canvas center.

### Debug mode
- **Debug mode** shows node IDs and a live **Debug** pill in the top bar with node/link counts.
- Use this when troubleshooting graphs or reporting issues.

### Connection style
Choose how links are drawn between nodes:
- **Curved** (default) for a smooth Bezier path.
- **Straight** for a direct line.
- **Orthogonal** for right-angle routing.

## Keyboard shortcuts
| Action | Shortcut |
| --- | --- |
| Open node picker | **Space** |
| Pan canvas | **Space + Drag** |
| Pan canvas | **Middle Drag** |
| Zoom | **Wheel** |
| Run graph | **G** |
| Delete selected node | **Del** |
| Close dialogs | **Esc** |

## Output & preview
- The right panel previews paths, mesh output, and gcode statistics.
- Use **Fit preview** to frame the latest toolpath.
- The HUD shows point count, length, extrusion, and estimated time.

## Tips
- Use the **Global Params** panel to define reusable constants.
- Hover inputs for hints, and keep nodes organized by grouping related operations.
- Combine **Rules** nodes with **Export** to fine-tune printer behavior.

## Troubleshooting
- If you see no output, ensure an **Export** node is connected to a valid toolpath.
- If links look too busy, switch to **Straight** or **Orthogonal** connection style.
- Toggle **Debug mode** to verify node IDs and link counts.

## Project layout
- `public/index.html` — main UI, graph editor, and styling.
- `public/nodes/` — node definitions and logic.
- `server.js` — lightweight local server for the app.
