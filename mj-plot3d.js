/**
 * mj-plot3d.js — JSXGraph helper for 3D surface plots z = f(x, y) in reveal.js slides.
 *
 * Needs JSXGraph (jsxgraphcore.js + jsxgraph.css) loaded before this file.
 *
 * Usage:
 *   plot3D('box-id', (x, y) => Math.sin(x) * Math.cos(y), { x: [-5, 5], y: [-5, 5] });
 *   plot3D('box-id', f, { style: 'faces' });               // filled, coloured by height
 *   plot3D('box-id', f, { style: 'faces', shading: 'light', hue: 25 });  // lit, one hue
 *
 * The board is created only once its slide is visible (a board created inside a
 * hidden slide gets size 0), and it is re-synced to reveal.js's scaling whenever
 * the slide changes or the window resizes, so dragging stays accurate.
 *
 * Returns a Promise that resolves to { board, view, surface } once the plot exists.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    x: [-5, 5],          // x-range of the domain
    y: [-5, 5],          // y-range of the domain
    z: null,             // z-range; null = computed from the function values

    style: 'mesh',       // 'mesh' (wireframe) or 'faces' (filled surface)
    steps: null,         // grid size per direction; null = 50 for mesh, 30 for faces

    // 'mesh' style
    color: '#1f6feb',    // colour of the mesh lines
    strokeWidth: 0.6,
    opacity: 0.9,        // line opacity (mesh) or face opacity (faces)

    // 'faces' style
    shading: 'height',   // 'height' (colour scale low→high) or 'light' (one hue, lit)
    colors: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c'], // low → high
    hue: 210,            // hue (0–360) for shading: 'light'
    edges: true,         // thin grid lines on the faces

    projection: 'parallel', // 'parallel' or 'central' (perspective)
    az: 1.0,             // start azimuth (rotation around the z-axis), radians
    el: 0.35,            // start elevation (tilt), radians
    fill: 0.6,           // fraction of the box height the 3D view takes up;
                         // lower = more empty margin, so axes stay inside when rotating
    sliders: false,      // show az/el sliders; dragging the plot rotates it either way
    axes: 'corner',      // 'corner' (three arrows from one corner, no numbers),
                         // or JSXGraph's own: 'border', 'center', 'none'
    axisColor: 'black',  // colour of the 'corner' axes
    ticks: false,        // tick marks/numbers ('border' axes only)
    floor: true,         // grey plane under the surface
    background: 'transparent', // any CSS colour, e.g. 'white'

    board: {},           // extra JSXGraph initBoard attributes (override defaults)
    view: {},            // extra view3d attributes
    surface: {},         // extra functiongraph3d / polyhedron3d attributes
    width: 760,          // fallback size (px), only used if the box has no CSS height
    height: 540
  };

  // Merge plain objects recursively; arrays and functions are replaced, not merged.
  function merge(target, source) {
    const out = Object.assign({}, target);
    for (const [key, value] of Object.entries(source || {})) {
      const isObject = value && typeof value === 'object' && !Array.isArray(value);
      out[key] = isObject && out[key] && typeof out[key] === 'object'
        ? merge(out[key], value)
        : value;
    }
    return out;
  }

  // Sample f on a grid and return a padded [zmin, zmax].
  function autoZRange(f, [x0, x1], [y0, y1], n) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const z = f(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * j / n);
        if (Number.isFinite(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); }
      }
    }
    if (!Number.isFinite(lo)) return [-1, 1];
    if (lo === hi) return [lo - 1, hi + 1];
    const pad = 0.05 * (hi - lo);
    return [lo - pad, hi + pad];
  }

  // Colour at position t (0..1) along a list of hex colour stops.
  function colorScale(stops, t) {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const s = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
    const i = Math.min(Math.floor(s), stops.length - 2);
    const a = rgb(stops[i]), b = rgb(stops[i + 1]), u = s - i;
    const c = a.map((v, k) => Math.round(v + (b[k] - v) * u));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // Grid of vertices [x, y, f(x, y)] and quadrilateral faces (as vertex indices).
  function gridMesh(f, [x0, x1], [y0, y1], n) {
    const vertices = [], faces = [], heights = [];
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * j / n;
        vertices.push([x, y, f(x, y)]);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const k = i * (n + 1) + j;
        const quad = [k, k + 1, k + n + 2, k + n + 1];
        const zs = quad.map((q) => vertices[q][2]);
        if (zs.every(Number.isFinite)) {
          faces.push(quad);
          heights.push(zs.reduce((a, b) => a + b) / 4);
        }
      }
    }
    return { vertices, faces, heights };
  }

  // Call cb once the element has a real size (its slide is shown).
  function whenVisible(el, cb) {
    if (el.offsetWidth > 0) { cb(); return; }
    const R = global.Reveal;
    if (R && typeof R.on === 'function') {
      const check = () => {
        if (el.offsetWidth > 0) {
          R.off('ready', check);
          R.off('slidechanged', check);
          cb();
        }
      };
      R.on('ready', check);
      R.on('slidechanged', check);
    } else {
      global.addEventListener('load', cb, { once: true });
    }
  }

  function plot3D(id, f, options) {
    const o = merge(DEFAULTS, options);
    const faces = o.style === 'faces';
    const steps = o.steps || (faces ? 30 : 50);
    const el = document.getElementById(id);
    if (!el) return Promise.reject(new Error(`plot3D: no element with id "${id}"`));

    return new Promise((resolve) => {
      whenVisible(el, () => {
        const zRange = o.z || autoZRange(f, o.x, o.y, steps);

        // A box without a CSS height collapses to a line; give it a fallback size.
        if (el.clientHeight === 0) {
          console.warn(`plot3D: #${id} has no height; using ${o.width}x${o.height}px. ` +
                       'Give the box a width and height in CSS.');
          el.style.width = o.width + 'px';
          el.style.height = o.height + 'px';
          el.style.margin = '0 auto';
        }

        // jsxgraph.css paints boxes white with a border; the inline style wins.
        // The box can take keyboard focus (arrow keys rotate it); clicking it would
        // then draw the browser's focus outline around the whole plot.
        el.style.background = o.background;
        el.style.border = 'none';
        el.style.outline = 'none';

        // Board coordinates: 16 units tall, width matching the box's shape, so
        // one unit is equally long horizontally and vertically (no stretching).
        const half = 8, halfW = half * el.clientWidth / el.clientHeight;
        const board = JXG.JSXGraph.initBoard(id, merge({
          boundingbox: [-halfW, half, halfW, -half],
          keepaspectratio: false,
          axis: false,
          showCopyright: false,
          showNavigation: false,
          pan: { enabled: false },
          zoom: { enabled: false }
        }, o.board));

        // The 3D view is a centred square; the rest of the box is margin.
        // With sliders, it moves up a bit to leave room for them underneath.
        const size = 2 * half * o.fill;
        const corner = [-size / 2, -size / 2 + (o.sliders ? 1.5 : 0)];
        const noTicks = { ticks3d: { visible: o.ticks, drawLabels: o.ticks } };

        const view = board.create('view3d',
          [corner, [size, size], [o.x, o.y, zRange]],
          merge({
            projection: o.projection,
            axesPosition: o.axes === 'corner' ? 'none' : o.axes,
            depthOrder: { enabled: faces },   // draw nearer faces over farther ones
            az: { slider: { visible: o.sliders, start: o.az } },
            el: { slider: { visible: o.sliders, start: o.el } },
            xPlaneRear: { visible: false },
            yPlaneRear: { visible: false },
            zPlaneRear: { visible: o.floor },
            xAxisBorder: noTicks,
            yAxisBorder: noTicks,
            zAxisBorder: noTicks
          }, o.view));

        // 'corner' axes: x, y and z all start at (xmin, ymin, zmin).
        if (o.axes === 'corner') {
          const [x0, x1] = o.x, [y0, y1] = o.y, [z0, z1] = zRange;
          const style = { strokeColor: o.axisColor, strokeWidth: 1.5, lastArrow: true, layer: 12 };
          view.create('line3d', [[x0, y0, z0], [x1, y0, z0]], style);
          view.create('line3d', [[x0, y0, z0], [x0, y1, z0]], style);
          view.create('line3d', [[x0, y0, z0], [x0, y0, z1]], style);
        }

        let surface;
        if (!faces) {
          surface = view.create('functiongraph3d',
            [f, o.x, o.y],
            merge({
              stepsU: steps,
              stepsV: steps,
              strokeColor: o.color,
              strokeWidth: o.strokeWidth,
              strokeOpacity: o.opacity
            }, o.surface));
        } else {
          const mesh = gridMesh(f, o.x, o.y, steps);
          const light = o.shading === 'light';
          // One colour per face, in face order: JSXGraph gives face i colour i of
          // fillColorArray. (Recolouring faces afterwards, one by one, takes ~30 s.)
          const [lo, hi] = zRange;
          const faceColors = light ? [] :
            mesh.heights.map((h) => colorScale(o.colors, (h - lo) / (hi - lo)));
          board.suspendUpdate();
          surface = view.create('polyhedron3d',
            [mesh.vertices, mesh.faces],
            merge({
              layer: 12,
              fillOpacity: o.opacity,
              strokeColor: '#000000',
              strokeOpacity: o.edges ? 0.25 : 0,
              strokeWidth: o.edges ? 0.4 : 0,
              fillColorArray: faceColors,
              shader: light
                ? { enabled: true, type: 'angle', hue: o.hue,
                    saturation: 90, minLightness: 30, maxLightness: 90 }
                : { enabled: false },
              vertices: { visible: false }
            }, o.surface));
          board.unsuspendUpdate();
        }

        // reveal.js scales slides with a CSS transform; keep mouse coordinates right.
        const R = global.Reveal;
        if (R && typeof R.on === 'function') {
          const sync = () => board.updateCSSTransforms();
          R.on('slidechanged', sync);
          R.on('resize', sync);
          sync();
        }

        resolve({ board, view, surface });
      });
    });
  }

  global.plot3D = plot3D;
})(window);
