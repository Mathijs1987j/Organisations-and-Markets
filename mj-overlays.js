// mj-overlays.js: Beamer-style overlays for reveal.js.
//
//   <g data-show="3, 5-8, 11">   visible at steps 3, 5 to 8, and 11
//   <li data-show="2-">          visible from step 2 on
//
// Step n is the moment the fragments with data-fragment-index="n" appear;
// step 0 is the slide before any fragment. Hidden elements keep their space
// (like Beamer's \uncover). The slide gets as many steps as the highest
// number used, so "11" adds steps up to 11 even without other fragments.
//
//   <script src="mj-overlays.js"></script>
//   Reveal.initialize({ plugins: [ MJOverlays, ... ] });
window.MJOverlays = {
  id: "mj-overlays",

  init(deck) {
    // "3, 5-8, 11-" -> [[3, 3], [5, 8], [11, Infinity]]
    const parse = (spec) =>
      spec
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => {
          const [from, to] = part.split("-").map((x) => x.trim());
          const lo = Number(from);
          const hi = !part.includes("-") ? lo : to === "" ? Infinity : Number(to);
          return [lo, hi];
        });

    const elements = [...deck.getSlidesElement().querySelectorAll("[data-show]")];
    for (const el of elements) {
      el.mjRanges = parse(el.dataset.show);
    }

    // Invisible fragments that create the steps 1, 2, ... on each slide.
    // data-mj-step keeps the step number: reveal renumbers fragment indices.
    for (const slide of new Set(elements.map((el) => el.closest("section")))) {
      let max = 0;
      for (const el of slide.querySelectorAll("[data-show]")) {
        for (const [lo, hi] of el.mjRanges) {
          max = Math.max(max, lo, Number.isFinite(hi) ? hi : 0);
        }
      }
      for (let i = 1; i <= max; i++) {
        const step = document.createElement("span");
        step.className = "fragment";
        step.dataset.fragmentIndex = i;
        step.dataset.mjStep = i;
        step.style.display = "none";
        slide.appendChild(step);
      }
    }

    const style = document.createElement("style");
    style.textContent = ".reveal .mj-hidden { visibility: hidden; }";
    document.head.appendChild(style);

    // Show or hide each element for the current step of the current slide.
    const update = () => {
      const slide = deck.getCurrentSlide();
      if (!slide) return;
      let step = 0;
      for (const marker of slide.querySelectorAll(".fragment.visible[data-mj-step]")) {
        step = Math.max(step, Number(marker.dataset.mjStep));
      }
      for (const el of slide.querySelectorAll("[data-show]")) {
        const on = el.mjRanges.some(([lo, hi]) => step >= lo && step <= hi);
        el.classList.toggle("mj-hidden", !on);
      }
    };

    for (const event of ["ready", "slidechanged", "fragmentshown", "fragmenthidden"]) {
      deck.on(event, update);
    }
  },
};
