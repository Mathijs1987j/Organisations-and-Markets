/*
 * gametree.js — extensive-form game trees for reveal.js slides
 *
 * Draws a game tree: inline SVG for lines and nodes, HTML labels on top that
 * MathJax typesets. On top of the tree you can, each with its own timing,
 *   - highlight moves: any strategy or strategy profile, equilibrium or not;
 *   - gray out a subgame you have solved; its highlighted moves stay
 *     highlighted, and optionally its value is boxed at its top node.
 * The helper doesn't solve anything: you say what is shown, and when.
 *
 * Timing ("when"):
 *   left out    always
 *   3           from step 3 on (a plain reveal.js fragment)
 *   '2-4, 7'    at steps 2 to 4 and at step 7 (needs the MJOverlays plugin)
 * Step n is the moment the fragments with data-fragment-index="n" appear.
 * Call gameTree() before Reveal.initialize().
 *
 * A node is one of:
 *   [a, b, ...]                  terminal node: payoff vector (numbers or LaTeX strings)
 *   { player, moves }            decision node
 *   { chance: true, moves }      chance node (Nature); `player` is an optional label
 * Optional on decision and chance nodes:
 *   id: 'x'      a name for the node, used in `highlight` and `solved`
 *   info: 'h'    nodes with the same `info` form one information set;
 *                'h' can then be used wherever a node id can in `highlight`
 * `moves` is { label: child, ... } or [[label, child], ...]
 * (use the second form if labels look like numbers: JavaScript reorders those keys).
 *
 * Options (besides layout):
 *   highlight: [{ choices: { x: 'In', h: 1 }, when, class }, ...]
 *       Highlights the chosen move at node x / information set h, in the colour
 *       of the player who moves there. A move is its label or its 0-based index.
 *       `class` adds a CSS class to these highlights (e.g. a dashed style).
 *   solved: [{ node: 'x', when, value: [1, 1] }, ...]
 *       Grays out the subgame that starts at node x. With `value`, that payoff
 *       is boxed at x (by default nothing is shown).
 *   focus: [{ node: 'x', when }, ...]
 *       The opposite: grays out everything outside the subgame that starts at
 *       node x, including the edge leading into it.
 */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULTS = {
    xGap: 110,          // horizontal distance between neighbouring terminal nodes (px)
    yGap: 100,          // vertical distance between levels (px)
    margin: 50,         // free space around the tree for labels (px)
    players: null,      // payoff order, e.g. ['1', '2']; default: order of first appearance
    payoffs: 'row',     // 'row' → (1, -1)   'column' → stacked
    highlight: [],
    solved: [],
    focus: [],
    mathOpen: '\\(',    // delimiters for the math the helper writes itself (payoffs)
    mathClose: '\\)',
  };

  function gameTree(target, spec, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const box = typeof target === 'string' ? document.querySelector(target) : target;
    if (!box) throw new Error(`gameTree: no element matches ${target}`);

    /* 1. Build the tree and the name tables ---------------------------- */
    const root = build(spec, 0);
    const nodes = [];
    walk(root, n => nodes.push(n));
    const inner = nodes.filter(n => n.type !== 'leaf');
    if (!o.players) {
      o.players = [...new Set(inner.filter(n => n.type === 'decision').map(n => n.player))];
    }
    const { ids, infoSets } = nameTables(inner);
    const find = key => {                         // node id or information-set name → nodes
      if (ids.has(key)) return [ids.get(key)];
      if (infoSets.has(key)) return infoSets.get(key);
      throw new Error(`gameTree: no node or information set called '${key}'`);
    };

    /* 2. Layout --------------------------------------------------------- */
    const nLeaves = layout(root, o);
    const maxDepth = Math.max(...nodes.map(n => n.depth));
    const width = 2 * o.margin + (nLeaves - 1) * o.xGap;
    const height = 2 * o.margin + maxDepth * o.yGap + (o.payoffs === 'column' ? 30 : 0);

    /* 3. Draw the tree --------------------------------------------------
     * Every element is stored in `els` of the node whose subgame it belongs
     * to, so graying out a subgame can find it: a node owns its dot, its
     * player label and its outgoing edges with their move labels.          */
    box.replaceChildren();
    box.classList.add('gt');
    box.style.width = width + 'px';
    box.style.height = height + 'px';

    const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}` });
    const gEdges = svgEl('g'), gInfo = svgEl('g'), gHigh = svgEl('g'), gNodes = svgEl('g');
    svg.append(gEdges, gInfo, gHigh, gNodes);      // later groups are drawn on top
    box.append(svg);

    for (const n of inner) {
      for (const c of n.children) {
        const line = svgEl('line', { x1: n.x, y1: n.y, x2: c.x, y2: c.y, class: 'gt-edge' });
        const lab = moveLabel(n, c);
        gEdges.append(line);
        box.append(lab);
        n.els.push(line, lab);
      }
    }

    // Information sets: a dashed line through the nodes, one player label above it.
    for (const set of infoSets.values()) {
      if (set.length < 2) continue;
      const pts = [...set].sort((a, b) => a.x - b.x);
      const path = svgEl('path', {
        d: pts.map((n, i) => `${i ? 'L' : 'M'} ${n.x} ${n.y}`).join(' '),
        class: 'gt-infoset',
      });
      const midX = (pts[0].x + pts[pts.length - 1].x) / 2;
      const topY = Math.min(...pts.map(n => n.y));
      const lab = label(midX, topY - 9, 'translate(-50%, -100%)', 'gt-player ' + colourClass(set[0], o));
      lab.textContent = set[0].player;
      gInfo.append(path);
      box.append(lab);
      set.els = [path, lab];
    }

    for (const n of nodes) {
      if (n.type === 'leaf') {
        const dot = svgEl('circle', { cx: n.x, cy: n.y, r: 2.5, class: 'gt-leaf' });
        const pay = label(n.x, n.y + 7, 'translate(-50%, 0)', 'gt-payoff');
        pay.textContent = o.mathOpen + payoffTex(n.payoff, o) + o.mathClose;
        gNodes.append(dot);
        box.append(pay);
        n.els.push(dot, pay);
        continue;
      }
      const chance = n.type === 'chance';
      const dot = svgEl('circle', {
        cx: n.x, cy: n.y, r: chance ? 5 : 4.5, class: chance ? 'gt-chance' : 'gt-node',
      });
      // The anchor above the node holds the player's name and, if asked, value
      // boxes. Only the name belongs to the node, so graying out the subgame
      // doesn't gray out the value shown at its top.
      // Centred above the root; for other nodes on the side away from the
      // incoming edge, so that long names don't cross it.
      const anchor =
        n.depth === 0      ? label(n.x, n.y - 9, 'translate(-50%, -100%)', 'gt-anchor')
        : n.isLeftChild    ? label(n.x - 4, n.y - 7, 'translate(-100%, -100%)', 'gt-anchor')
        :                    label(n.x + 4, n.y - 7, 'translate(0, -100%)', 'gt-anchor');
      const name = document.createElement('span');
      name.className = 'gt-player ' + colourClass(n, o);
      name.textContent = n.inInfoSet ? '' : n.player;   // info sets: label drawn once, above
      anchor.append(name);
      gNodes.append(dot);
      box.append(anchor);
      n.els.push(dot, name);
      n.anchor = anchor;
    }

    /* 4. Highlighted moves ---------------------------------------------- */
    for (const h of o.highlight) {
      for (const [key, move] of Object.entries(h.choices)) {
        for (const n of find(key)) {
          const c = n.children[moveIndex(n, move)];
          const cls = ['gt-hl', colourClass(n, o), h.class].filter(Boolean).join(' ');
          const hl = svgEl('line', { x1: n.x, y1: n.y, x2: c.x, y2: c.y, class: cls });
          setWhen(hl, h.when);
          gHigh.append(hl);
        }
      }
    }

    /* 5. Solved subgames ------------------------------------------------ */
    const solved = o.solved.map(s => {
      if (!ids.has(s.node)) throw new Error(`gameTree: solved: no node with id '${s.node}'`);
      return { ...s, top: ids.get(s.node) };
    });

    // First the value boxes, so that graying out a larger subgame later can
    // also gray out the value boxes inside it.
    for (const s of solved) {
      if (!s.value) continue;
      const wrap = document.createElement('div');      // grayed out by larger subgames
      wrap.className = 'gt-value' + (s.top.isLeftChild ? ' gt-left' : '');
      const val = document.createElement('span');     // appears at `when`
      val.className = 'gt-value-box';
      val.textContent = o.mathOpen + payoffTex(s.value, o) + o.mathClose;
      setWhen(val, s.when);
      wrap.append(val);
      s.top.anchor.append(wrap);
      s.top.valueEls.push(wrap);
    }

    // Then collect, per element, the timings of everything that grays it out.
    const dims = new Map();                            // element → list of `when`s
    const addDim = (el, when) => {
      if (!dims.has(el)) dims.set(el, []);
      dims.get(el).push(when);
    };
    // The elements of the subgame starting at `top` (value boxes inside it,
    // but not those at `top` itself), and information sets lying inside it.
    const subgameEls = top => {
      const sub = [];
      walk(top, n => sub.push(n));
      const inSub = new Set(sub);
      const els = sub.flatMap(n => (n === top ? n.els : [...n.els, ...n.valueEls]));
      for (const set of infoSets.values()) {
        if (set.els && set.every(n => inSub.has(n))) els.push(...set.els);
      }
      return els;
    };

    for (const s of solved) {
      for (const el of subgameEls(s.top)) addDim(el, s.when);
    }

    // focus: gray out everything outside the subgame, the edge into it included.
    const allEls = [
      ...nodes.flatMap(n => [...n.els, ...n.valueEls]),
      ...[...infoSets.values()].flatMap(set => set.els ?? []),
    ];
    for (const f of o.focus) {
      if (!ids.has(f.node)) throw new Error(`gameTree: focus: no node with id '${f.node}'`);
      const top = ids.get(f.node);
      const keep = new Set([...subgameEls(top), ...top.valueEls]);
      for (const el of allEls) if (!keep.has(el)) addDim(el, f.when);
    }

    dims.forEach((whens, el) => setDim(el, whens));

    typeset(box);
    return box;
  }

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */

  // Show `el` only at the given time.
  function setWhen(el, when) {
    if (when === undefined || when === null) return;
    if (typeof when === 'number') {
      el.classList.add('fragment');
      el.setAttribute('data-fragment-index', when);
    } else {
      el.setAttribute('data-show', when);
    }
  }

  // Gray out `el` whenever one of the subgames containing it is grayed out.
  function setDim(el, whens) {
    if (whens.some(w => w === undefined || w === null)) {
      el.classList.add('gt-dimmed');                   // always
    } else if (whens.every(w => typeof w === 'number')) {
      el.classList.add('fragment', 'gt-dim');          // from the earliest step on
      el.setAttribute('data-fragment-index', Math.min(...whens));
    } else {                                           // MJOverlays: union of the ranges
      el.setAttribute('data-dim', whens.map(w => (typeof w === 'number' ? `${w}-` : w)).join(', '));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Building the tree                                                   */
  /* ------------------------------------------------------------------ */

  function build(spec, depth) {
    const n = { spec, depth, children: [], els: [], valueEls: [] };
    if (Array.isArray(spec)) {                         // terminal node
      n.type = 'leaf';
      n.payoff = spec;
      return n;
    }
    if (!spec || !spec.moves) {
      throw new Error('gameTree: a node must be a payoff array or an object with `moves`: '
                      + JSON.stringify(spec));
    }
    n.type = spec.chance ? 'chance' : 'decision';
    n.player = spec.player ?? '';
    n.id = spec.id ?? null;
    n.info = spec.info ?? null;
    const moves = Array.isArray(spec.moves) ? spec.moves : Object.entries(spec.moves);
    for (const [move, childSpec] of moves) {
      const child = build(childSpec, depth + 1);
      child.move = String(move);
      n.children.push(child);
    }
    if (n.children.length === 0) throw new Error('gameTree: node without moves');
    return n;
  }

  function walk(n, f) {
    f(n);
    n.children.forEach(c => walk(c, f));
  }

  function nameTables(inner) {
    const ids = new Map(), infoSets = new Map();
    for (const n of inner) {
      if (n.id !== null) {
        if (ids.has(n.id)) throw new Error(`gameTree: two nodes with id '${n.id}'`);
        ids.set(n.id, n);
      }
      if (n.info !== null) {
        if (!infoSets.has(n.info)) infoSets.set(n.info, []);
        infoSets.get(n.info).push(n);
      }
    }
    for (const set of infoSets.values()) {
      if (set.length < 2) continue;
      const moves = n => n.children.map(c => c.move).join('|');
      if (set.some(n => n.player !== set[0].player || moves(n) !== moves(set[0]))) {
        console.warn(`gameTree: the nodes in information set '${set[0].info}' should have `
                     + 'the same player and the same moves');
      }
      set.forEach(n => { n.inInfoSet = true; });
    }
    return { ids, infoSets };
  }

  function moveIndex(n, move) {
    const i = typeof move === 'number' ? move : n.children.findIndex(c => c.move === move);
    if (i < 0 || i >= n.children.length) {
      throw new Error(`gameTree: '${move}' is not a move of player ${n.player} there`);
    }
    return i;
  }

  /* ------------------------------------------------------------------ */
  /* Layout                                                              */
  /* ------------------------------------------------------------------ */

  // Terminal nodes get consecutive x positions from left to right; every other
  // node sits halfway between its leftmost and rightmost child. y follows depth.
  function layout(root, o) {
    let nextLeaf = 0;
    (function place(n) {
      n.y = o.margin + n.depth * o.yGap;
      if (n.type === 'leaf') {
        n.x = o.margin + nextLeaf * o.xGap;
        nextLeaf += 1;
        return;
      }
      n.children.forEach(place);
      n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
      // a left child's incoming edge arrives from the upper right,
      // so its value box goes on the left
      n.children.forEach(c => { c.isLeftChild = c.x < n.x - 0.5; });
    })(root);
    return nextLeaf;
  }

  /* ------------------------------------------------------------------ */
  /* Drawing helpers                                                     */
  /* ------------------------------------------------------------------ */

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  // An absolutely positioned HTML label. (x, y) is an anchor point; `transform`
  // says which corner or side of the label sits on that point.
  function label(x, y, transform, cls) {
    const d = document.createElement('div');
    d.className = 'gt-label ' + cls;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    d.style.transform = transform;
    return d;
  }

  // Move labels sit beside the middle of the edge, on the outer side, so they
  // never cross the line: up-left of a left edge, up-right of a right edge.
  function moveLabel(n, c) {
    const mx = (n.x + c.x) / 2, my = (n.y + c.y) / 2;
    let lab;
    if (c.x < n.x - 0.5) lab = label(mx - 3, my - 3, 'translate(-100%, -100%)', 'gt-move');
    else if (c.x > n.x + 0.5) lab = label(mx + 3, my - 3, 'translate(0, -100%)', 'gt-move');
    else lab = label(mx + 8, my, 'translate(0, -50%)', 'gt-move');
    lab.textContent = c.move;                          // textContent: '<' in LaTeX is harmless
    return lab;
  }

  // gt-p1, gt-p2, ... for players (in payoff order), gt-nature for chance nodes
  function colourClass(n, o) {
    if (n.type === 'chance') return 'gt-nature';
    const i = o.players.indexOf(n.player);
    return i >= 0 ? `gt-p${i + 1}` : '';
  }

  // (1, -1) with each component wrapped in \class{gt-pK}{...} so CSS can colour it.
  function payoffTex(vec, o) {
    const parts = vec.map((v, i) => `\\class{gt-p${i + 1}}{${v}}`);
    if (parts.length === 1) return parts[0];
    return o.payoffs === 'column'
      ? `\\begin{array}{c}${parts.join(' \\\\ ')}\\end{array}`
      : `(${parts.join(', ')})`;
  }

  // Typeset the labels. If MathJax isn't loaded yet, its own start-up pass will
  // typeset the whole page, these labels included, once it is.
  function typeset(el) {
    const MJ = global.MathJax;
    if (MJ && typeof MJ.typesetPromise === 'function') {
      const ready = (MJ.startup && MJ.startup.promise) || Promise.resolve();
      return ready.then(() => MJ.typesetPromise([el]))
                  .catch(err => console.error('gameTree: MathJax error', err));
    }
    return Promise.resolve();
  }

  global.gameTree = gameTree;
})(window);
