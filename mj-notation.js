// GENERATED from config.org ("Writing and teaching / Mathematical notation"). Do not edit; edit config.org.
// mj-notation.js: the notation of MJPreamble.sty for reveal.js decks that
// typeset maths with MathJax 4 (or MathJax 3.2.1 or later).
//
//   <script src="mj-notation.js"></script>
//   Reveal.initialize({ mathjax4: MJNotation.mathjax4(), plugins: [RevealMath.MathJax4] });
// For an older deck with MathJax 3:
//   Reveal.initialize({ mathjax3: MJNotation.mathjax3(), plugins: [RevealMath.MathJax3] });
(function () {
  "use strict";

  // The definitions shared with MJPreamble.sty, then the slides' own.
  const definitions = String.raw`
% Number sets
\newcommand{\N}{\mathbb{N}}
\newcommand{\Z}{\mathbb{Z}}
\newcommand{\Q}{\mathbb{Q}}
\newcommand{\R}{\mathbb{R}}
\newcommand{\C}{\mathbb{C}}
% Brackets that size themselves: \abs{x}, \abs*{\frac ab}, \abs[\big]{x}
\DeclarePairedDelimiter{\abs}{\lvert}{\rvert}
\DeclarePairedDelimiter{\norm}{\lVert}{\rVert}
\DeclarePairedDelimiter{\ceil}{\lceil}{\rceil}
\DeclarePairedDelimiter{\floor}{\lfloor}{\rfloor}
% Operators
\DeclareMathOperator*{\argmax}{argmax}
\DeclareMathOperator*{\argmin}{argmin}
\DeclareMathOperator*{\argsup}{argsup}
\DeclareMathOperator*{\arginf}{arginf}
\DeclareMathOperator{\supp}{supp}
\DeclareMathOperator{\conv}{conv}
\DeclareMathOperator{\E}{\mathbb{E}}
\DeclareMathOperator{\Var}{Var}
\DeclareMathOperator{\Cov}{Cov}
% The d of integrals and derivatives
\newcommand{\dd}{\mathop{}\!\mathrm{d}}
% A display-size integral sign in running text
\newcommand{\dint}{\mathop{\displaystyle\int}\nolimits}
% Slides: \given keeps its size; \ubar underlines; double-struck via \mathbb
\newcommand{\given}{\mid}
\DeclarePairedDelimiterX{\set}[1]{\{}{\}}{#1}
\newcommand{\ubar}[1]{\underline{#1}}
\newcommand{\mathbbm}[1]{\mathbb{#1}}
\newcommand{\mathds}[1]{\mathbb{#1}}
% Larger integral signs, from your slides (text sizes are not allowed in
% LaTeX's maths, so these exist only here)
\newcommand{\Lint}{\mathop{\Large\int}\nolimits}
\newcommand{\LLint}{\mathop{\LARGE\int}\nolimits}
\newcommand{\Hint}{\mathop{\Huge\int}\nolimits}
`;

  // MathJax options for the math plugin: load mathtools (for the self-sizing
  // brackets) and run the definitions once, before the page is typeset.
  // OPTIONS are your own MathJax options; they are kept.
  function mathjax4(options) {
    const config = Object.assign({}, options);

    const loader = Object.assign({}, config.loader);
    loader.load = (loader.load || []).concat(["[tex]/mathtools"]);
    config.loader = loader;

    const tex = Object.assign({}, config.tex);
    // MathJax loads its braket extension by itself the first time it meets
    // \set, and that extension's \set (no starred form) would replace ours.
    tex.autoload = Object.assign({ braket: [] }, tex.autoload);
    if (Array.isArray(tex.packages)) {
      tex.packages = tex.packages.concat(["mathtools"]);
    } else {
      const packages = Object.assign({}, tex.packages);
      packages["[+]"] = (packages["[+]"] || []).concat(["mathtools"]);
      tex.packages = packages;
    }
    config.tex = tex;

    const startup = Object.assign({}, config.startup);
    const ownPageReady = startup.pageReady;
    startup.pageReady = function () {
      const MathJax = window.MathJax;
      // One definition at a time, so that one MathJax rejects (or one that
      // needs an extension loaded first) cannot take the others with it.
      const lines = definitions
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.trim().startsWith("%"));
      let done = Promise.resolve();
      for (const line of lines) {
        done = done.then(() =>
          MathJax.tex2mmlPromise(line).catch((error) =>
            console.warn("mj-notation: could not define", line, error),
          ),
        );
      }
      return done.then(() => (ownPageReady ? ownPageReady() : MathJax.startup.defaultPageReady()));
    };
    config.startup = startup;

    return config;
  }

  // The same options work for both versions.
  window.MJNotation = { definitions: definitions, mathjax4: mathjax4, mathjax3: mathjax4 };
})();
