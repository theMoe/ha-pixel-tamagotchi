/**
 * Gebaute Objekte auf dem Dashboard: zeichnen, platzieren, antippen.
 *
 * Eine neue Art ist eine Zeile in BUILD_KINDS plus ein SVG - die Logik darunter bleibt
 * unberuehrt. Die Beschaeftigung ist ebenfalls datengetrieben: das Tier geht hin, das
 * Objekt bekommt fuer ein paar Sekunden seine `busy`-Klasse, fertig.
 *
 * Alle SVGs zeichnen im selben Pixelraster wie das Tier (ganzzahlige Einheiten,
 * shape-rendering:crispEdges) und sitzen mit der Unterkante auf der Standflaeche.
 */

const svg = (w, h, inhalt) => `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">${inhalt}</svg>`;

export const BUILD_KINDS = {
  house: {
    width: 52,
    height: 46,
    text: "visit_house",
    svg: svg(
      26,
      23,
      `<path d="M3 10h20v12H3z" fill="#d7a86e"/><path d="M13 2l11 9H2z" fill="#c0392b"/>
       <rect x="10" y="14" width="6" height="8" fill="#8d6e63"/><rect x="14" y="18" width="1" height="1" fill="#ffca28"/>
       <rect x="5" y="12" width="4" height="4" fill="#8ab4f8"/><rect x="17" y="12" width="4" height="4" fill="#8ab4f8"/>
       <rect class="chimney" x="18" y="4" width="3" height="4" fill="#7f5539"/>`,
    ),
  },
  swing: {
    width: 46,
    height: 44,
    text: "visit_swing",
    svg: svg(
      23,
      22,
      `<path d="M2 21L11 3M21 21L12 3" stroke="#8d6e63" stroke-width="2" fill="none"/>
       <rect x="3" y="3" width="17" height="1" fill="#8d6e63"/>
       <g class="seat"><rect x="8" y="4" width="1" height="9" fill="#a1887f"/><rect x="14" y="4" width="1" height="9" fill="#a1887f"/>
       <rect x="7" y="13" width="9" height="2" fill="#6d4c41"/></g>`,
    ),
  },
  flowers: {
    width: 38,
    height: 26,
    text: "visit_flowers",
    svg: svg(
      19,
      13,
      `<rect x="0" y="10" width="19" height="3" fill="#6d4c41"/>
       <g class="bloom"><rect x="3" y="4" width="1" height="6" fill="#2e7d32"/><rect x="2" y="2" width="3" height="3" fill="#e91e63"/>
       <rect x="9" y="3" width="1" height="7" fill="#2e7d32"/><rect x="8" y="1" width="3" height="3" fill="#ffca28"/>
       <rect x="15" y="5" width="1" height="5" fill="#2e7d32"/><rect x="14" y="3" width="3" height="3" fill="#8e24aa"/></g>`,
    ),
  },
  snowman: {
    width: 34,
    height: 44,
    text: "visit_snowman",
    svg: svg(
      17,
      22,
      `<circle cx="8.5" cy="17" r="5" fill="#f5f5f5" stroke="#b0bec5"/><circle cx="8.5" cy="9" r="3.5" fill="#f5f5f5" stroke="#b0bec5"/>
       <rect x="8" y="8" width="3" height="1" fill="#ef6c00"/><rect x="7" y="7" width="1" height="1" fill="#111"/><rect x="10" y="7" width="1" height="1" fill="#111"/>
       <rect x="5" y="4" width="7" height="2" fill="#111"/><rect x="6" y="2" width="5" height="2" fill="#111"/>
       <rect x="2" y="12" width="3" height="1" fill="#8d6e63"/><rect x="12" y="12" width="3" height="1" fill="#8d6e63"/>`,
    ),
  },
  golf: {
    width: 30,
    height: 40,
    text: "visit_golf",
    svg: svg(
      15,
      20,
      `<ellipse cx="7.5" cy="18" rx="6" ry="2" fill="#2e7d32"/><ellipse cx="7.5" cy="17.5" rx="2" ry="1" fill="#111"/>
       <rect x="7" y="2" width="1" height="15" fill="#eceff1"/><path d="M8 2h6v4H8z" fill="#e53935"/>`,
    ),
  },
};

export const BUILDS_CSS = `
  .pixel-build { position:absolute; pointer-events:auto; cursor:pointer; }
  .pixel-build svg { display:block; shape-rendering:crispEdges; overflow:visible; }
  /* Beschaeftigung: das Objekt lebt kurz auf, waehrend das Tier daneben steht. */
  .pixel-build.busy .chimney { animation:pixel-smoke 1.2s ease-out infinite; }
  .pixel-build.busy .seat { animation:pixel-swing 1.4s ease-in-out infinite; transform-origin:50% 8%; transform-box:fill-box; }
  .pixel-build.busy .bloom { animation:pixel-bloom 1s ease-in-out infinite alternate; transform-origin:50% 100%; transform-box:fill-box; }
  .pixel-ball { position:absolute; width:6px; height:6px; border-radius:50%; background:#fff; box-shadow:0 0 0 1px #90a4ae; }
  @keyframes pixel-smoke { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-8px); } }
  @keyframes pixel-swing { 0%,100% { transform:rotate(-14deg); } 50% { transform:rotate(14deg); } }
  @keyframes pixel-bloom { to { transform:scaleY(1.15); } }
  @media (prefers-reduced-motion: reduce) { .pixel-build.busy * { animation:none !important; } }
`;

/**
 * Haelt die DOM-Elemente der gebauten Objekte im Gleichklang mit dem Backend.
 * Abgleich nach ``id``, nicht nach Anzahl - anders als bei den Haeufchen hat hier
 * jedes Objekt eine Identitaet, und beim Antippen muss genau dieses verschwinden.
 */
export class BuildYard {
  constructor(layer, onRemove) {
    this.layer = layer;
    this.onRemove = onRemove;
    this.items = new Map(); // id -> { el, build }
  }

  sync(builds, place) {
    const gesehen = new Set();
    for (const build of builds) {
      gesehen.add(build.id);
      let eintrag = this.items.get(build.id);
      if (!eintrag) {
        eintrag = { el: this._create(build), build };
        this.items.set(build.id, eintrag);
      }
      eintrag.build = build;
    }
    for (const [id, eintrag] of [...this.items]) {
      if (!gesehen.has(id)) {
        eintrag.el.remove();
        this.items.delete(id);
      }
    }
    this.place(place);
  }

  /** Rechnet die waagerechte Lage in Pixel um; die Hoehe liefert der Aufrufer. */
  place(place) {
    for (const { el, build } of this.items.values()) {
      const art = BUILD_KINDS[build.kind] || BUILD_KINDS.house;
      const { x, y } = place(build, art);
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y - art.height)}px`;
    }
  }

  /** Mittelpunkt der Standflaeche eines Objekts - dorthin laeuft das Tier. */
  spotOf(build) {
    const eintrag = this.items.get(build.id);
    if (!eintrag) return null;
    const art = BUILD_KINDS[build.kind] || BUILD_KINDS.house;
    return { x: parseFloat(eintrag.el.style.left) || 0, y: (parseFloat(eintrag.el.style.top) || 0) + art.height, art };
  }

  /** Laesst ein Objekt fuer ``ms`` aufleben, waehrend das Tier daneben steht. */
  async busy(build, ms) {
    const eintrag = this.items.get(build.id);
    if (!eintrag) return;
    eintrag.el.classList.add("busy");
    await new Promise((r) => setTimeout(r, ms));
    eintrag.el.classList.remove("busy");
  }

  /** Golfball: fliegt im Bogen vom Tier zur Fahne und verschwindet. */
  putt(from, to, ms = 900) {
    const ball = document.createElement("div");
    ball.className = "pixel-ball";
    ball.style.left = `${from.x}px`;
    ball.style.top = `${from.y}px`;
    this.layer.appendChild(ball);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const bogen = Math.sin(t * Math.PI) * 40;
      ball.style.left = `${from.x + (to.x - from.x) * t}px`;
      ball.style.top = `${from.y + (to.y - from.y) * t - bogen}px`;
      if (t < 1) requestAnimationFrame(step);
      else ball.remove();
    };
    requestAnimationFrame(step);
  }

  clear() {
    for (const { el } of this.items.values()) el.remove();
    this.items.clear();
  }

  _create(build) {
    const art = BUILD_KINDS[build.kind] || BUILD_KINDS.house;
    const el = document.createElement("div");
    el.className = "pixel-build";
    el.style.width = `${art.width}px`;
    el.style.height = `${art.height}px`;
    el.title = build.kind;
    el.innerHTML = art.svg;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      // Sofort lokal entfernen, damit genau das angetippte verschwindet.
      el.remove();
      this.items.delete(build.id);
      this.onRemove(build);
    });
    this.layer.appendChild(el);
    return el;
  }
}
