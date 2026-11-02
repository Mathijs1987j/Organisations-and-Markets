/**
 * mj-plot3d.js   JSXGraph helper for 3D surface plots z = f(x, y) in reveal.js slides.
 *
 * Needs JSXGraph (jsxgraphcore.js + jsxgraph.css) loaded before this file.
 *
 * Usage:
 *   plot3D('box-id', (x, y) => Math.sin(x) * Math.cos(y), { x: [-5, 5], y: [-5, 5] });
 *
 * The board is created only once its slide is visible (a board created inside a
 * hidden slide gets size 0), and it is re-synced to reveal.js's scaling whenever
 * the slide changes or the window resizes, so dragging the sliders stays accurate.
 *
 * Returns a Promise that resolves to { board, view, surface } once the plot exists.
 */
(function (global) {
	"use strict";

	const DEFAULTS = {
		x: [-5, 5], // x-range of the domain
		y: [-5, 5], // y-range of the domain
		z: null, // z-range; null = computed from the function values
		steps: 50, // grid lines in each direction (more = finer, slower)
		color: "#1f6feb", // colour of the mesh lines
		strokeWidth: 0.6,
		opacity: 0.9,
		projection: "parallel", // 'parallel' or 'central' (perspective)
		az: 1.0, // start azimuth (rotation around the z-axis), radians
		el: 0.35, // start elevation (tilt), radians
		sliders: true, // show the az/el sliders for rotating
		axes: "border", // 'border', 'center' or 'none'
		board: {}, // extra JSXGraph initBoard attributes (override defaults)
		view: {}, // extra view3d attributes
		surface: {}, // extra functiongraph3d attributes
	};

	// Merge plain objects recursively; arrays and functions are replaced, not merged.
	function merge(target, source) {
		const out = Object.assign({}, target);
		for (const [key, value] of Object.entries(source || {})) {
			const isObject =
				value && typeof value === "object" && !Array.isArray(value);
			out[key] =
				isObject && out[key] && typeof out[key] === "object"
					? merge(out[key], value)
					: value;
		}
		return out;
	}

	// Sample f on a grid and return a padded [zmin, zmax].
	function autoZRange(f, [x0, x1], [y0, y1], n) {
		let lo = Infinity,
			hi = -Infinity;
		for (let i = 0; i <= n; i++) {
			for (let j = 0; j <= n; j++) {
				const z = f(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n);
				if (Number.isFinite(z)) {
					lo = Math.min(lo, z);
					hi = Math.max(hi, z);
				}
			}
		}
		if (!Number.isFinite(lo)) return [-1, 1];
		if (lo === hi) return [lo - 1, hi + 1];
		const pad = 0.05 * (hi - lo);
		return [lo - pad, hi + pad];
	}

	// Call cb once the element has a real size (its slide is shown).
	function whenVisible(el, cb) {
		if (el.offsetWidth > 0) {
			cb();
			return;
		}
		const R = global.Reveal;
		if (R && typeof R.on === "function") {
			const check = () => {
				if (el.offsetWidth > 0) {
					R.off("ready", check);
					R.off("slidechanged", check);
					cb();
				}
			};
			R.on("ready", check);
			R.on("slidechanged", check);
		} else {
			global.addEventListener("load", cb, { once: true });
		}
	}

	function plot3D(id, f, options) {
		const o = merge(DEFAULTS, options);
		const el = document.getElementById(id);
		if (!el)
			return Promise.reject(new Error(`plot3D: no element with id "${id}"`));

		return new Promise((resolve) => {
			whenVisible(el, () => {
				const zRange = o.z || autoZRange(f, o.x, o.y, o.steps);

				const board = JXG.JSXGraph.initBoard(
					id,
					merge(
						{
							boundingbox: [-8, 8, 8, -8],
							keepaspectratio: false,
							axis: false,
							showCopyright: false,
							showNavigation: false,
							pan: { enabled: false },
							zoom: { enabled: false },
						},
						o.board,
					),
				);

				const view = board.create(
					"view3d",
					[
						[-6, -3],
						[8, 8],
						[o.x, o.y, zRange],
					],
					merge(
						{
							projection: o.projection,
							axesPosition: o.axes,
							az: { slider: { visible: o.sliders, start: o.az } },
							el: { slider: { visible: o.sliders, start: o.el } },
							xPlaneRear: { visible: false },
							yPlaneRear: { visible: false },
						},
						o.view,
					),
				);

				const surface = view.create(
					"functiongraph3d",
					[f, o.x, o.y],
					merge(
						{
							stepsU: o.steps,
							stepsV: o.steps,
							strokeColor: o.color,
							strokeWidth: o.strokeWidth,
							strokeOpacity: o.opacity,
						},
						o.surface,
					),
				);

				// reveal.js scales slides with a CSS transform; keep mouse coordinates right.
				const R = global.Reveal;
				if (R && typeof R.on === "function") {
					const sync = () => board.updateCSSTransforms();
					R.on("slidechanged", sync);
					R.on("resize", sync);
					sync();
				}

				resolve({ board, view, surface });
			});
		});
	}

	global.plot3D = plot3D;
})(window);
