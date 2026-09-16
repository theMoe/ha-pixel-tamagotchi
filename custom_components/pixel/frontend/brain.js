/** Verhalten: Idle-Schleife, Reaktionen auf Backend-Zustand und Events. */

import { HIDE_MAX_SECONDS, HIDE_SINK } from "./const.js";
import { Texts } from "./texts.js";
import { clamp, deepElementFromPoint, pick, reducedMotion, rnd, wait } from "./util.js";

export class Brain {
  constructor({ overlay, furniture, mover, config, lang, callService }) {
    this.o = overlay;
    this.f = furniture;
    this.m = mover;
    this.config = config;
    this.lang = lang;
    this.callService = callService;
    this.snap = null;
    this.running = false;
    this.busy = false;
    this.hiding = null; // Karte, hinter der wir stecken
    this.anchor = null; // { card, offsetX } oder null = Boden
    this._loopToken = 0;
    this._lastActivity = null;
    this._lastMood = null;
    this._lastStage = null;
    this._hidingSince = 0; // Zeitstempel, damit das Versteck nicht ewig dauert
    this._busySince = 0;
    this._lastLoopAt = 0; // vom Watchdog gelesen: laeuft die Schleife noch?
    this._freshPoop = false; // naechstes Haeufchen entsteht am Standort des Tieres
  }

  t(key, data) {
    return Texts.pick(this.lang, key, data);
  }

  /* ---------------- Lebenszyklus */

  start() {
    if (this.running) return;
    this.running = true;
    this.f.scan();
    const start = this.f.byType("calendar") || this.f.climbable()[0];
    if (start) {
      this.anchor = { card: start, offsetX: 20 };
      this.o.place(start.x1 + 20, start.top);
    } else {
      this.o.place(this.f.bounds.left + 40, this.f.floorY);
    }
    setTimeout(() => {
      if (!this.o.bubbleEl.classList.contains("on")) this.o.say(this.t("hello"), 1600);
    }, 500);
    this._loop(++this._loopToken);
  }

  stop() {
    this.running = false;
    this._loopToken++;
    this.m.cancel();
  }

  /* ---------------- Zustand vom Backend */

  update(snap) {
    const prev = this.snap;
    this.snap = snap;
    this.m.speed = snap.stress_level >= 2 ? 0.38 : snap.stress_level === 1 ? 0.26 : 0.16;
    this.o.rig.apply(snap, { hidden: !!this.hiding });
    this._syncPoop(snap.poop_count || 0);

    if (prev && snap.activity !== prev.activity) this._onActivity(snap.activity);
    if (prev && snap.stage !== prev.stage && snap.stage !== "egg") this.o.rig.play("wobble", 800);
    if (snap.sleeping && !prev?.sleeping) this._goToSleepSpot();
    if (snap.animations_enabled === false) this.m.cancel();
  }

  /** Einziger Aufrufer von syncPoop: Anzahl aus dem Backend, Ort aus der Card. */
  _syncPoop(count) {
    this.o.syncPoop(count, this.f.bounds, () => this.callService("clean", { count: 1 }), () => this._poopSpot());
  }

  /**
   * Wo ein neues Haeufchen landet. Frisch passiert heisst: dort, wo das Tier gerade steht -
   * auch oben auf einer Karte. Alles, was beim Laden der Seite schon da war, wird ueber
   * Kartenoberkanten und Boden verstreut, damit nicht alles auf einer Linie liegt.
   */
  _poopSpot() {
    if (this._freshPoop) {
      this._freshPoop = false;
      return { x: this.o.pos.x, y: this.o.pos.y };
    }
    const cards = this.f.climbable();
    const b = this.f.bounds;
    if (cards.length && Math.random() < 0.7) {
      const c = pick(cards);
      return { x: rnd(c.x1 + 8, Math.max(c.x1 + 8, c.x2 - 30)), y: c.top };
    }
    return { x: rnd(b.left + 20, Math.max(b.left + 20, b.right - 50)), y: this.f.floorY };
  }

  _onActivity(activity) {
    if (activity === "eating") this._interrupt(async () => {
      await this._unhide(false);
      await wait(1800);
    });
    if (activity === "playing" && !reducedMotion()) this._interrupt(() => this._trick("tumble"));
  }

  /* ---------------- Events vom Bus */

  onEvent(type, data) {
    const simple = ["fed", "overfed", "played", "petted", "grumbled", "cleaned", "healed", "sick", "too_tired", "tummy_ache", "medicine_refused", "revived", "hatched", "died", "fell_asleep", "woke_up", "evolved"];
    if (simple.includes(type)) this.o.say(this.t(type), type === "died" ? 4000 : 1800);
    if (type === "petted") this.o.fx("heart", "♥");
    if (type === "welcome_home") this._interrupt(async () => {
      await this._unhide(false);
      this.o.say(this.t("welcome_home"), 2500);
      await this._jump();
      await this._jump();
    });
    if (type === "hungry" || type === "feeding_time") this._interrupt(() => this._pointAt("entit", this.t(type)));
    if (type === "appointment_soon") this._interrupt(() => this._pointAt("calendar", this.t("appointment_soon", data), 5000));
    if (type === "poop") {
      // Das Haeufchen ist gerade erst passiert - es gehoert dorthin, wo das Tier steht.
      this._freshPoop = true;
      this._interrupt(async () => this.o.say(this.t("poop_hint"), 1500));
    }
    if (type === "say") this._interrupt(async () => {
      await this._unhide(false);
      this.o.say(String(data.text || ""), (data.duration || 4) * 1000);
    });
    if (type === "trick") this._interrupt(() => this._trick(data.trick || "random"));
  }

  /* ---------------- Idle-Schleife */

  /**
   * Prueft, ob an der Stelle des Tiers noch das Tier selbst obenauf liegt. Verdeckt es etwas
   * anderes (Vollbild-Bildschirmschoner, Dialog-Overlay), pausiert die Schleife. Rein
   * geometrisch, also ohne Kopplung an eine bestimmte fremde Karte.
   * `update()` laeuft weiter, damit das Tier nach dem Aufwachen sofort richtig aussieht.
   */
  _covered() {
    if (this.hiding) return false; // selbst geclippt ist keine fremde Verdeckung
    if (!document.elementFromPoint) return false;
    const x = Math.round(this.o.pos.x + this.o.size / 2);
    const y = Math.round(this.o.pos.y - this.o.size / 2);
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const hit = deepElementFromPoint(x, y);
    return !!hit && !this.o.el.contains(hit);
  }

  async _loop(token) {
    while (this.running && token === this._loopToken) {
      await wait(rnd(this.config.idle_min_seconds, this.config.idle_max_seconds) * 1000);
      if (!this.running || token !== this._loopToken) return;
      this._lastLoopAt = Date.now();
      // Ohne diesen Schutz beendet eine einzige Exception die Schleife endgueltig:
      // `running` bliebe true, und `start()` stiege sofort wieder aus.
      try {
        await this._loopStep();
      } catch (err) {
        console.warn("[pixel-card] Idle-Schritt fehlgeschlagen", err);
      }
    }
  }

  async _loopStep() {
    if (this.busy || !this.snap || document.visibilityState === "hidden") return;
    if (this.snap.animations_enabled === false) return;

    const s = this.snap;
    if (s.fainted) return;
    if (s.sleeping) {
      if (Math.random() < 0.6) this.o.fx("zzz", "z", 30);
      return;
    }
    // Vor der Verdeckungspruefung: im Versteck ist das Tier absichtlich geclippt,
    // und nur `_peek()` holt es dort wieder hervor.
    if (this.hiding) {
      if (Date.now() - this._hidingSince > HIDE_MAX_SECONDS * 1000) return this._unhide(false);
      return this._peek();
    }
    if (this._covered()) return; // Bildschirmschoner oder Dialog davor: nichts zu sehen, nichts zu tun
    if (s.stage === "egg") {
      if (Math.random() < 0.5) await this.o.rig.play("wobble", 800);
      return;
    }
    await this._chooseIdleAction(s);
  }

  async _chooseIdleAction(s) {
    const r = Math.random();
    if (s.mood === "hungry" && r < 0.35) return this._pointAt("entit", this.t("hungry"));
    if (s.mood === "stressed" && r < 0.35) return this._pointAt("calendar", this.t("stressed"));
    if (s.mood === "lonely" && r < 0.3) return this.o.say(this.t("lonely"), 1800);
    if (s.mood === "bored" && r < 0.3) return this.o.say(this.t("bored"), 1800);
    if (s.media_playing && r < 0.4 && !reducedMotion()) return this._dance();
    if (s.weather === "rainy" && r < 0.1) return this.o.say(this.t("rain"), 1000);
    if (s.weather === "sunny" && r < 0.08) return this.o.say(this.t("sunny"), 1400);
    if (r < 0.18) return this._hide();
    if (r < 0.26 && !reducedMotion()) return this._trick("tumble");
    if (r < 0.32) return this._kickCard();
    if (r < 0.38) return this._jump();
    if (r < 0.44 && !reducedMotion()) return this._trick("wave");
    return this._walkRandom();
  }

  /* ---------------- Aktionen */

  async _interrupt(fn) {
    if (this.busy) return;
    this.busy = true;
    this._busySince = Date.now();
    this.m.cancel();
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Holt das Tier aus jedem Zustand zurueck, aus dem es allein nicht mehr herausfindet.
   * Einziger Ort, der dafuer die internen Felder anfassen darf; der Watchdog erkennt nur.
   */
  recover(reason) {
    console.warn(`[pixel-card] Tier wird zurueckgeholt (${reason})`);
    this.hiding = null;
    this.anchor = null;
    this.busy = false;
    this.m.cancel();
    this.o.clipBelow(null);
    if (this.snap) this.o.rig.apply(this.snap, { hidden: false });
    this.f.scan();
    const x = clamp(this.o.pos.x, this.f.bounds.left, Math.max(this.f.bounds.left, this.f.bounds.right - this.o.size));
    this.o.place(x, this.f.floorY);
    if (!this.running) this.start();
    else this._loop(++this._loopToken); // alte Schleife abhaengen, frische starten
  }

  _rescan() {
    this.f.scan();
    if (this.anchor?.card) {
      const c = this.f.refresh(this.anchor.card);
      if (c) this.o.place(c.x1 + this.anchor.offsetX, c.top);
      else this.anchor = null;
    }
    if (this.hiding) {
      const c = this.f.refresh(this.hiding);
      if (c) this.o.clipBelow(c.top);
      else this._unhide(false);
    }
    if (!this.anchor && !this.hiding) this.o.place(clamp(this.o.pos.x, this.f.bounds.left, this.f.bounds.right - this.o.size), this.f.floorY);
    this._syncPoop(this.snap?.poop_count || 0);
  }

  async _walkRandom() {
    this.f.scan();
    const options = this.f.climbable();
    const useFloor = Math.random() < 0.35 || !options.length;
    if (useFloor) {
      this.anchor = null;
      const x = rnd(this.f.bounds.left + 8, this.f.bounds.right - this.o.size - 8);
      return this.m.to(x, this.f.floorY);
    }
    const c = pick(options);
    const offsetX = rnd(6, Math.max(6, c.x2 - c.x1 - this.o.size - 6));
    this.anchor = { card: c, offsetX };
    return this.m.to(c.x1 + offsetX, c.top);
  }

  async _hide(target) {
    this.f.scan();
    const candidates = this.f.climbable();
    if (!candidates.length) return this._walkRandom();
    const c = target || pick(candidates.filter((x) => x.fav).concat(candidates));
    const offsetX = rnd(8, Math.max(8, c.x2 - c.x1 - this.o.size - 8));
    this.anchor = { card: c, offsetX };
    const ok = await this.m.to(c.x1 + offsetX, c.top);
    if (!ok) return;
    this.hiding = c;
    this._hidingSince = Date.now();
    this.o.rig.apply(this.snap, { hidden: true });
    const clip = () => this.o.clipBelow(c.top);
    await this.m.to(this.o.pos.x, c.top + this.o.size * HIDE_SINK, { dur: 400, hop: 0, keepFacing: true, onFrame: clip });
    clip();
    this.o.say(this.t("hide"), 1500);
  }

  async _peek() {
    if (!this.hiding) return;
    const c = this.hiding;
    const clip = () => this.o.clipBelow(c.top);
    await this.m.to(this.o.pos.x, this.o.pos.y - 10, { dur: 250, hop: 0, keepFacing: true, onFrame: clip });
    await wait(900);
    if (!this.hiding) return;
    await this.m.to(this.o.pos.x, this.o.pos.y + 10, { dur: 250, hop: 0, keepFacing: true, onFrame: clip });
  }

  async _unhide(startled) {
    if (!this.hiding) return;
    const c = this.hiding;
    this.hiding = null;
    this.o.clipBelow(null);
    this.o.rig.apply(this.snap, { hidden: false });
    await this.m.to(this.o.pos.x, c.top, { dur: 350, hop: 30, keepFacing: true });
    if (startled) {
      this.o.say(this.t("boo"), 1200);
      this._shake(c.el);
      this.callService("pet");
    }
  }

  async _trick(name) {
    const options = ["tumble", "jump", "kick", "wave", "hide"];
    const trick = options.includes(name) ? name : pick(options);
    await this._unhide(false);
    if (trick === "hide") return this._hide();
    if (trick === "kick") return this._kickCard();
    if (trick === "jump") {
      await this._jump();
      await this._jump();
      return this.o.say(this.t("trick"), 1200);
    }
    if (trick === "wave") {
      await this.o.rig.play("wave", 1500);
      return;
    }
    const dir = this.o.pos.x < (this.f.bounds.left + this.f.bounds.right) / 2 ? 1 : -1;
    const x = clamp(this.o.pos.x + dir * 160, this.f.bounds.left + 8, this.f.bounds.right - this.o.size - 8);
    this.o.petEl.classList.add("tumble");
    const ok = await this.m.to(x, this.o.pos.y, { dur: 900, hop: 0 });
    this.o.petEl.classList.remove("tumble");
    if (!ok) return;
    if (this.anchor) this.anchor.offsetX = this.o.pos.x - this.anchor.card.x1;
    this.o.say(this.t("trick"), 1500);
  }

  async _jump() {
    const y = this.o.pos.y;
    await this.m.to(this.o.pos.x, y - 14, { dur: 180, hop: 0, keepFacing: true });
    await this.m.to(this.o.pos.x, y, { dur: 180, hop: 0, keepFacing: true });
  }

  async _dance() {
    const x = clamp(this.o.pos.x + pick([-30, 30]), this.f.bounds.left, this.f.bounds.right - this.o.size);
    this.o.petEl.classList.add("tumble");
    const ok = await this.m.to(x, this.o.pos.y, { dur: 900, hop: 0 });
    this.o.petEl.classList.remove("tumble");
    if (ok && this.anchor) this.anchor.offsetX = this.o.pos.x - this.anchor.card.x1;
  }

  async _kickCard() {
    this.f.scan();
    const options = this.f.climbable().filter((c) => !c.type.includes("calendar"));
    if (!options.length) return this._walkRandom();
    const c = pick(options);
    this.anchor = { card: c, offsetX: 10 };
    const ok = await this.m.to(c.x1 + 10, c.top);
    if (!ok) return;
    this._shake(c.el);
    this.o.say("hihi", 1000);
  }

  async _pointAt(typeFragment, text, ms = 2600) {
    await this._unhide(false);
    this.f.scan();
    const c = this.f.byType(typeFragment) || pick(this.f.climbable());
    if (c) {
      this.anchor = { card: c, offsetX: 6 };
      await this.m.to(c.x1 + 6, c.top);
      this._shake(c.el);
    }
    this.o.say(text, ms);
  }

  async _goToSleepSpot() {
    await this._interrupt(async () => {
      await this._unhide(false);
      this.anchor = null;
      await this.m.to(this.f.bounds.right - this.o.size - 16, this.f.floorY);
    });
  }

  /**
   * Kurzes Wackeln der Karte, auf der das Tier landet. Bewusst ueber die Web Animations API:
   * schreibt keine Inline-Styles auf fremde Karten, kollidiert damit nicht mit ha-sortable im
   * Bearbeitungsmodus und laesst keine transition-Eigenschaft zurueck.
   */
  _shake(el) {
    if (!el || reducedMotion() || !el.animate) return;
    const steps = ["0", "-4px", "4px", "-2px", "0"];
    el.animate(
      steps.map((v) => ({ transform: `translateX(${v})` })),
      { duration: 400, easing: "ease-out" },
    );
  }

  /* ---------------- Interaktion */

  onPetTap(menuEntries) {
    if (this.hiding) return this._interrupt(() => this._unhide(true));
    if (this.snap?.sleeping) return this.o.say(this.t("grumbled"), 1000);
    return this.o.toggleMenu(menuEntries);
  }

  onCardTapped(el) {
    if (this.hiding && this.hiding.el === el) this._interrupt(() => this._unhide(true));
  }
}
