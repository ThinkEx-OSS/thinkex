/** Interactive cell-cycle widget rendered inside the landing-page document preview. */
export const CELL_CYCLE_WIDGET_HTML = `
<style>
  .cycle-layout { display: grid; grid-template-columns: minmax(220px, .9fr) minmax(260px, 1.1fr); gap: clamp(28px, 5vw, 64px); align-items: center; padding: 20px 12px; }
  .cycle-visual { display: grid; place-items: center; min-height: 280px; border-radius: calc(var(--radius) * 1.5); background: radial-gradient(circle, color-mix(in srgb, var(--chart-1) 13%, transparent) 0%, transparent 68%); }
  .cycle-visual svg { width: min(100%, 300px); overflow: visible; }
  .cycle-track { fill: none; stroke: var(--muted); stroke-width: 12; }
  .cycle-arc { fill: none; stroke-width: 12; stroke-linecap: round; opacity: .22; transition: opacity .2s ease, stroke-width .2s ease, filter .2s ease; }
  .cycle-arc[data-active="true"] { stroke-width: 18; opacity: 1; filter: drop-shadow(0 0 7px color-mix(in srgb, var(--chart-1) 48%, transparent)); }
  .cycle-label { fill: var(--muted-foreground); font: 600 12px var(--font-sans); }
  .cycle-label[data-active="true"] { fill: var(--foreground); }
  .cycle-center { fill: color-mix(in srgb, var(--card) 92%, transparent); stroke: var(--border); stroke-width: 1.5; }
  .cell-nucleus { fill: color-mix(in srgb, var(--chart-1) 15%, var(--card)); stroke: color-mix(in srgb, var(--chart-1) 55%, var(--border)); }
  .chromosome { fill: none; stroke: var(--chart-1); stroke-width: 3; stroke-linecap: round; }
  .cycle-phase { fill: var(--muted-foreground); font: 700 11px var(--font-sans); text-anchor: middle; }
  .checkpoint { fill: var(--background); stroke: var(--border); stroke-width: 2; }
  .checkpoint[data-active="true"] { fill: var(--chart-1); stroke: var(--background); stroke-width: 3; }
  .cycle-copy { display: grid; gap: 18px; align-content: center; }
  .phase-summary { display: grid; gap: 6px; }
  .phase-kicker { color: var(--primary); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .phase-title { display: block; font-size: 21px; line-height: 1.2; }
  .phase-detail { min-height: 42px; margin: 0; line-height: 1.55; }
  .cycle-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cycle-stat { position: relative; overflow: hidden; padding: 11px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: color-mix(in srgb, var(--muted) 68%, transparent); }
  .cycle-stat::before { position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--chart-1); content: ""; }
  .cycle-stat span { display: block; color: var(--muted-foreground); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .cycle-stat strong { display: block; margin-top: 4px; font-size: 12px; }
  .cycle-failure { min-height: 46px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--destructive) 32%, var(--border)); border-radius: var(--radius); background: color-mix(in srgb, var(--destructive) 8%, transparent); }
  .cycle-failure span { display: block; color: var(--muted-foreground); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  .cycle-failure strong { display: block; margin-top: 2px; font-size: 12px; }
  @media (max-width: 580px) { .cycle-layout { grid-template-columns: 1fr; gap: 16px; padding: 8px 2px; } .cycle-visual { min-height: 240px; } }
</style>
<div class="tx-stack">
  <div class="cycle-layout">
    <div class="tx-visual cycle-visual">
      <svg viewBox="0 0 280 280" role="img" aria-labelledby="cycle-svg-title cycle-svg-desc">
        <title id="cycle-svg-title">Interactive cell cycle diagram</title>
        <desc id="cycle-svg-desc">The selected phase is emphasized and the center shows whether the cell proceeds or pauses.</desc>
        <circle class="cycle-track" cx="140" cy="140" r="82"></circle>
        <g transform="rotate(-87 140 140)">
          <circle class="cycle-arc" data-phase-arc="g1" cx="140" cy="140" r="82" stroke="var(--chart-1)" stroke-dasharray="112 403" stroke-dashoffset="0"></circle>
          <circle class="cycle-arc" data-phase-arc="s" cx="140" cy="140" r="82" stroke="var(--chart-2)" stroke-dasharray="112 403" stroke-dashoffset="-129"></circle>
          <circle class="cycle-arc" data-phase-arc="g2" cx="140" cy="140" r="82" stroke="var(--chart-3)" stroke-dasharray="112 403" stroke-dashoffset="-258"></circle>
          <circle class="cycle-arc" data-phase-arc="m" cx="140" cy="140" r="82" stroke="var(--chart-4)" stroke-dasharray="112 403" stroke-dashoffset="-387"></circle>
        </g>
        <circle class="checkpoint" data-checkpoint="g1" cx="211" cy="99" r="7"></circle>
        <circle class="checkpoint" data-checkpoint="s" cx="210" cy="184" r="7"></circle>
        <circle class="checkpoint" data-checkpoint="g2" cx="69" cy="184" r="7"></circle>
        <circle class="checkpoint" data-checkpoint="m" cx="70" cy="97" r="7"></circle>
        <circle class="cycle-center" cx="140" cy="140" r="58"></circle>
        <circle class="cell-nucleus" cx="140" cy="139" r="23"></circle>
        <path class="chromosome" d="M130 128l8 10-8 11M138 128l-8 10 8 11M144 128l7 10-7 11M151 128l-7 10 7 11"></path>
        <text id="cycle-phase" class="cycle-phase" x="140" y="181">G1</text>
        <text class="cycle-label" data-phase-label="g1" x="218" y="68">G1</text>
        <text class="cycle-label" data-phase-label="s" x="219" y="222">S</text>
        <text class="cycle-label" data-phase-label="g2" x="54" y="222">G2</text>
        <text class="cycle-label" data-phase-label="m" x="54" y="68">M</text>
      </svg>
    </div>
    <div class="cycle-copy">
      <div role="tablist" aria-label="Cell cycle phases">
        <button role="tab" aria-selected="true" data-phase="g1">G1</button>
        <button role="tab" aria-selected="false" data-phase="s">S</button>
        <button role="tab" aria-selected="false" data-phase="g2">G2</button>
        <button role="tab" aria-selected="false" data-phase="m">M</button>
      </div>
      <div class="phase-summary" aria-live="polite">
        <div id="phase-kicker" class="phase-kicker">Before DNA replication</div>
        <strong id="phase-title" class="phase-title">G1 checkpoint</strong>
        <p id="phase-detail" class="tx-muted phase-detail">Checks cell size, nutrients, and DNA integrity before committing to replication.</p>
        <div class="cycle-stats">
          <div class="cycle-stat"><span>Checks</span><strong id="cycle-check">Size · nutrients · DNA</strong></div>
          <div class="cycle-stat"><span>Outcome</span><strong id="cycle-outcome">Enter S phase</strong></div>
        </div>
      </div>
      <div class="cycle-failure" aria-live="polite">
        <div><span>If this check fails</span><strong id="cycle-failure">DNA damage → pause for repair</strong></div>
      </div>
    </div>
  </div>
</div>
<script>
const phases = {
  g1: { kicker: "Before DNA replication", title: "G1 checkpoint", detail: "Checks cell size, nutrients, and DNA integrity before committing to replication.", check: "Size · nutrients · DNA", pass: "Enter S phase", failure: "DNA damage → pause for repair" },
  s: { kicker: "DNA synthesis", title: "S phase", detail: "Duplicates the genome while repair enzymes monitor each newly copied strand.", check: "Replication fidelity", pass: "Continue copying DNA", failure: "Replication error → slow and repair" },
  g2: { kicker: "Before mitosis", title: "G2 checkpoint", detail: "Confirms replication is complete and the genome is ready for cell division.", check: "Complete · intact DNA", pass: "Enter mitosis", failure: "Incomplete DNA → delay mitosis" },
  m: { kicker: "Chromosome separation", title: "M checkpoint", detail: "Verifies that every chromosome is attached correctly before separation.", check: "Spindle attachment", pass: "Separate chromosomes", failure: "Bad attachment → stop separation" },
};
let activePhase = "g1";
const tabs = document.querySelectorAll('[role="tab"]');

function render() {
  const phase = phases[activePhase];
  tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.phase === activePhase)));
  document.querySelectorAll("[data-phase-arc]").forEach((arc) => arc.dataset.active = String(arc.dataset.phaseArc === activePhase));
  document.querySelectorAll("[data-phase-label]").forEach((label) => label.dataset.active = String(label.dataset.phaseLabel === activePhase));
  document.querySelectorAll("[data-checkpoint]").forEach((checkpoint) => checkpoint.dataset.active = String(checkpoint.dataset.checkpoint === activePhase));
  document.querySelector("#phase-kicker").textContent = phase.kicker;
  document.querySelector("#phase-title").textContent = phase.title;
  document.querySelector("#phase-detail").textContent = phase.detail;
  document.querySelector("#cycle-check").textContent = phase.check;
  document.querySelector("#cycle-outcome").textContent = phase.pass;
  document.querySelector("#cycle-failure").textContent = phase.failure;
  document.querySelector("#cycle-phase").textContent = activePhase.toUpperCase();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activePhase = tab.dataset.phase;
    render();
  });
});
render();
</script>`;
