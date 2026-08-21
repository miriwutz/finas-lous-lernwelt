import {
  auth, db, spaceRef, defaultState,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ensureSpace, onSnapshot, updateDoc, runTransaction, serverTimestamp
} from "./firebase.js";

const APP_VERSION = "2.5b Kindgerechter Baum-Infobereich";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let state = structuredClone(defaultState);
let unsubscribe = null;
let selectedHearts = [];
let adminDraft = { fina: [], lou: [] };
let attentionTicker = null;
let pendingTreeGrowth = false;
let pendingRootGrowth = false;
let pendingGiftGrowth = false;
let treeGrowthTimer = null;

const DEFAULT_LEAF_COLORS = {
  fina: {
    easy: "#b89adf",
    medium: "#f2cf63",
    tricky: "#86b978"
  },
  lou: {
    easy: "#ef9fb3",
    medium: "#7fb7d2",
    tricky: "#d49a3a"
  }
};

let pendingDifficultyTaskId = null;

const dailyMissions = [
  "🌸 Nimm heute einmal bewusst etwas Schönes wahr.",
  "🌞 Vielleicht wartet heute irgendwo ein kleiner Glücksmoment auf dich.",
  "🍀 Halte Ausschau nach etwas, das dir ein Lächeln schenkt.",
  "🌈 Manchmal sind die schönsten Dinge ganz klein.",
  "💛 Schau heute, was dein Herz froh macht.",
  "🦋 Entdecke etwas, das du gestern noch nicht gesehen hast.",
  "🌼 Lass dich heute von etwas Schönem überraschen.",
  "😊 Vielleicht zauberst du heute auch jemandem ein Lächeln ins Gesicht.",
  "✨ Jeder Tag hält kleine Schätze bereit.",
  "🌻 Öffne deine Augen für die schönen Farben des Tages.",
  "🍃 Höre einmal ganz genau hin – vielleicht entdeckst du ein schönes Geräusch.",
  "🐦 Vielleicht begegnet dir heute etwas, das dich staunen lässt.",
  "🌺 Sammle heute drei schöne Momente.",
  "💚 Es gibt jeden Tag etwas, worüber man sich freuen kann.",
  "🌟 Die Welt steckt voller kleiner Wunder.",
  "🌸 Heute ist ein guter Tag, um etwas Schönes zu entdecken.",
  "☀️ Genieße einen Moment ganz bewusst.",
  "🍎 Vielleicht macht dir heute etwas ganz Einfaches Freude.",
  "🌈 Achte darauf, was heute gut gelingt.",
  "🕊️ Lass dein Herz kleine Freuden sammeln.",
  "🌼 Manchmal beginnt ein schöner Tag mit einem einzigen Lächeln.",
  "🍀 Finde heute etwas, wofür du dankbar sein kannst.",
  "🌷 Entdecke etwas, das dir guttut.",
  "✨ Jeder neue Tag bringt neue Möglichkeiten zum Staunen.",
  "🌞 Lass die schönen Momente heute besonders hell leuchten.",
  "🦉 Schau neugierig auf die Welt – sie hat viel zu zeigen.",
  "💐 Vielleicht findest du heute deinen Lieblingsmoment des Tages.",
  "🌸 Freude versteckt sich oft in den kleinen Dingen.",
  "🌻 Behalte die schönen Augenblicke gut in deinem Herzen."
];

const heartOptions = [
  { key: "help", icon: "💗", title: "Hilfsbereitschaft", text: "Jemandem geholfen" },
  { key: "comfort", icon: "🌸", title: "Mitgefühl", text: "Jemanden getröstet" },
  { key: "courage", icon: "⭐", title: "Mut", text: "Etwas gewagt" },
  { key: "persist", icon: "🌱", title: "Dranbleiben", text: "Nicht aufgegeben" },
  { key: "beauty", icon: "☀️", title: "Schöner Moment", text: "Etwas Schönes entdeckt" },
  { key: "curious", icon: "🦋", title: "Neugier", text: "Etwas wissen wollen" },
  { key: "kindness", icon: "🤝", title: "Freundlichkeit", text: "Freundlichkeit erlebt" },
  { key: "respect", icon: "🤍", title: "Rücksicht", text: "Auf jemanden Rücksicht genommen" },
  { key: "other", icon: "✨", title: "Sonstiges", text: "Ein eigener Herzmoment" }
];

const leafPositions = [
  /* 1–10: sofort über die ganze Krone verteilt */
  [282,104,-12,1],[165,188,-48,1],[394,184,42,-1],[236,150,24,1],[336,146,-30,-1],
  [116,228,-68,1],[448,226,64,-1],[204,230,58,-1],[365,232,-52,1],[286,206,8,1],

  /* 11–20: Lücken schließen, auch obere Krone deutlich nutzen */
  [220,92,-34,1],[348,92,36,-1],[145,132,18,1],[420,132,-18,-1],[88,184,-80,1],
  [480,182,78,-1],[176,278,-18,1],[394,278,20,-1],[260,270,44,-1],[316,270,-42,1],

  /* 21–30: zweite natürliche Schicht */
  [110,120,-56,1],[458,118,54,-1],[190,108,52,-1],[378,108,-50,1],[132,252,34,-1],
  [434,250,-36,1],[230,198,-70,1],[342,198,72,-1],[264,126,66,-1],[304,126,-64,1],

  /* 31–40: feiner auffüllen, ohne Ballung */
  [78,216,-88,1],[492,214,86,-1],[158,224,76,-1],[410,222,-74,1],[204,304,-38,1],
  [364,304,40,-1],[248,242,-12,1],[326,242,14,-1],[126,166,46,-1],[442,164,-44,1],

  /* 41–50: Endzustand – Rand und Krone schließen */
  [96,146,-28,1],[470,146,30,-1],[182,156,-78,1],[386,156,80,-1],[148,304,24,-1],
  [420,302,-26,1],[238,318,62,-1],[334,318,-60,1],[280,82,6,1],[286,292,-4,-1]
];


function leafSvg() {
  return `<svg viewBox="0 0 46 46" aria-hidden="true">
    <path class="leaf-fill" d="M8 33 C9 17 20 7 36 8 C34 24 24 35 8 33 Z"/>
    <path class="vein" d="M12 30 C18 24 25 18 32 12"/>
    <path class="vein" d="M18 24 C17 19 17 16 18 13"/>
    <path class="vein" d="M23 20 C27 22 31 22 34 21"/>
  </svg>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function learningDayKey(date = new Date()) {
  const shifted = new Date(date);
  shifted.setHours(shifted.getHours() - 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth()+1).padStart(2,"0")}-${String(shifted.getDate()).padStart(2,"0")}`;
}

function emptyTask(child) {
  return { id: crypto.randomUUID(), child, title:"", note:"", type:"paper", url:"", done:false, attentionSeconds:0, activeSince:null };
}

function ensureMinimumTaskSlots(tasks, child, minimum = 4) {
  const slots = (tasks || []).filter(t => t.child === child).map(t => ({...t}));
  while (slots.length < minimum) slots.push(emptyTask(child));
  return slots;
}

function migrateRoot(root) {
  return { ...root, kinds:(root.kinds || []).map(k => (k === "joy" || k === "consideration") ? "respect" : k) };
}

function chooseDailyMission(previous = "") {
  const choices = dailyMissions.filter(m => m !== previous);
  const pool = choices.length ? choices : dailyMissions;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function prepareLearningDay() {
  const today = learningDayKey();

  await runTransaction(db, async tx => {
    const snap = await tx.get(spaceRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const previousDay = data.lastLearningDay || null;
    const isNewDay = previousDay !== today;

    let tasks = [...(data.tasks || [])];

    if (previousDay && isNewDay) {
      tasks = tasks.map(task =>
        task.done
          ? emptyTask(task.child)
          : { ...task, done: false, activeSince: null }
      );
    }

    const roots = (data.roots || []).map(migrateRoot);
    const forest = (data.forest || []).map(tree => ({
      ...tree,
      roots: (tree.roots || []).map(migrateRoot)
    }));

    const dailyMission =
      (!data.dailyMission || isNewDay)
        ? chooseDailyMission(data.dailyMission || "")
        : data.dailyMission;

    tx.update(spaceRef, {
      tasks: [
        ...ensureMinimumTaskSlots(tasks, "fina"),
        ...ensureMinimumTaskSlots(tasks, "lou")
      ],
      roots,
      forest,
      dailyMission,
      lastLearningDay: today,
      dayClosed: isNewDay ? false : Boolean(data.dayClosed),
      dayClosedAt: isNewDay ? null : (data.dayClosedAt || null),
      dayClosedKey: isNewDay ? null : (data.dayClosedKey || null),
      dayClosingBackup: isNewDay ? null : (data.dayClosingBackup || null),
      appVersion: APP_VERSION,
      updatedAt: serverTimestamp()
    });
  });
}


const MAX_SESSION_SECONDS = 120 * 60;

function currentAttentionSeconds(task) {
  const saved = Number(task.attentionSeconds || 0);
  if (!task.activeSince) return saved;

  const started = new Date(task.activeSince).getTime();
  if (!Number.isFinite(started)) return saved;

  const runningSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return saved + Math.min(runningSeconds, MAX_SESSION_SECONDS);
}

function currentSessionSeconds(task) {
  if (!task.activeSince) return 0;

  const started = new Date(task.activeSince).getTime();
  if (!Number.isFinite(started)) return 0;

  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function formatAttentionMinutes(seconds) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours} Std. ${minutes} Min.`;
  }

  return `${totalMinutes} Min.`;
}

function updateAttentionDisplays() {
  let needsRender = false;

  $$("[data-attention-task]").forEach(element => {
    const task = (state.tasks || []).find(item => item.id === element.dataset.attentionTask);
    if (!task) return;

    element.textContent = `💛 ${formatAttentionMinutes(currentAttentionSeconds(task))}`;

    if (task.activeSince && currentSessionSeconds(task) >= MAX_SESSION_SECONDS) {
      needsRender = true;
    }
  });

  if (needsRender) {
    stopExpiredAttentionSessions();
  }
}

function startAttentionTicker() {
  if (attentionTicker) clearInterval(attentionTicker);
  attentionTicker = setInterval(updateAttentionDisplays, 15000);
  updateAttentionDisplays();
}

async function stopExpiredAttentionSessions() {
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      if (!snap.exists()) return;

      const tasks = [...(snap.data().tasks || [])];
      let changed = false;

      const updatedTasks = tasks.map(task => {
        if (!task.activeSince) return task;

        const started = new Date(task.activeSince).getTime();
        if (!Number.isFinite(started)) {
          changed = true;
          return { ...task, activeSince: null };
        }

        const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
        if (elapsed < MAX_SESSION_SECONDS) return task;

        changed = true;
        return {
          ...task,
          attentionSeconds: Number(task.attentionSeconds || 0) + MAX_SESSION_SECONDS,
          activeSince: null
        };
      });

      if (changed) {
        tx.update(spaceRef, {
          tasks: updatedTasks,
          updatedAt: serverTimestamp()
        });
      }
    });
  } catch (err) {
    console.error("Automatische Aufmerksamkeitspause fehlgeschlagen:", err);
  }
}

async function toggleAttention(taskId) {
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      if (!snap.exists()) return;

      const tasks = [...(snap.data().tasks || [])];
      const index = tasks.findIndex(task => task.id === taskId);
      if (index < 0) return;

      const task = { ...tasks[index] };

      if (task.activeSince) {
        const started = new Date(task.activeSince).getTime();
        const elapsed = Number.isFinite(started)
          ? Math.max(0, Math.floor((Date.now() - started) / 1000))
          : 0;

        task.attentionSeconds =
          Number(task.attentionSeconds || 0) +
          Math.min(elapsed, MAX_SESSION_SECONDS);

        task.activeSince = null;
      } else {
        task.activeSince = new Date().toISOString();
      }

      tasks[index] = task;

      tx.update(spaceRef, {
        tasks,
        updatedAt: serverTimestamp()
      });
    });
  } catch (err) {
    alert("Die Aufmerksamkeitszeit konnte nicht gespeichert werden: " + err.message);
  }
}

function createTreeMagic(preview, treeClone, { amount = 34, duration = 2500 } = {}) {
  if (!preview || !treeClone) return;

  treeClone.classList.remove("tree-magic-glow");
  void treeClone.offsetWidth;
  treeClone.classList.add("tree-magic-glow");

  const old = preview.querySelector(".tree-magic-sparkles");
  old?.remove();

  const layer = document.createElement("div");
  layer.className = "tree-magic-sparkles";
  preview.appendChild(layer);

  const previewRect = preview.getBoundingClientRect();
  const treeRect = treeClone.getBoundingClientRect();

  for (let i = 0; i < amount; i++) {
    const sparkle = document.createElement("i");
    sparkle.className = "tree-magic-sparkle";

    const x =
      treeRect.left - previewRect.left +
      treeRect.width * (0.12 + Math.random() * 0.76);

    const y =
      treeRect.top - previewRect.top +
      treeRect.height * (0.10 + Math.random() * 0.78);

    sparkle.style.left = `${x}px`;
    sparkle.style.top = `${y}px`;
    sparkle.style.setProperty("--magic-delay", `${Math.random() * .85}s`);
    sparkle.style.setProperty("--magic-size", `${3 + Math.random() * 6}px`);
    sparkle.style.setProperty("--magic-drift", `${-9 + Math.random() * 18}px`);

    layer.appendChild(sparkle);
  }

  setTimeout(() => {
    layer.remove();
    treeClone.classList.remove("tree-magic-glow");
  }, duration);
}

function showTreeGrowthCelebration() {
  const dialog = $("#treeGrowthDialog");
  const preview = $("#treeGrowthPreview");
  const tree = $("#treeCanvas");
  const flyingLeaf = $("#flyingLeaf");

  if (!dialog || !preview || !tree) return;

  if (treeGrowthTimer) {
    clearTimeout(treeGrowthTimer);
    treeGrowthTimer = null;
  }

  const treeClone = tree.cloneNode(true);
  treeClone.removeAttribute("id");
  treeClone.classList.add("tree-growth-canvas");
  treeClone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));

  const newestLeaf = treeClone.querySelector(".dynamic-leaf:last-of-type");
  const newestShape = newestLeaf?.querySelector(".leaf-shape");
  newestShape?.classList.add("new-growth-leaf");

  preview.querySelector(".tree-growth-canvas")?.remove();
  preview.appendChild(treeClone);

  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => createTreeMagic(preview, treeClone, { amount:42, duration:3000 }));
  requestAnimationFrame(() => createTreeMagic(preview, treeClone, { amount:38, duration:3000 }));

  requestAnimationFrame(() => {
    dialog.classList.remove("rainbow-bloom");
    void dialog.offsetWidth;
    dialog.classList.add("rainbow-bloom");

    if (!flyingLeaf || !newestLeaf) return;

    const previewRect = preview.getBoundingClientRect();
    const leafRect = newestLeaf.getBoundingClientRect();

    const startX = 18;
    const startY = 12;
    const targetX = leafRect.left + leafRect.width / 2 - previewRect.left;
    const targetY = leafRect.top + leafRect.height / 2 - previewRect.top;

    flyingLeaf.getAnimations().forEach(animation => animation.cancel());
    flyingLeaf.style.opacity = "0";

    const frames = [];
    const steps = 34;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const arc = Math.sin(Math.PI * t) * Math.min(74, Math.max(34, targetY * 0.16));
      const wave = Math.sin(t * Math.PI * 3.4) * (1 - t) * 11;
      const x = startX + (targetX - startX) * t + wave;
      const y = startY + (targetY - startY) * t - arc;

      frames.push({
        offset: t,
        opacity: t < 0.03 ? 0 : (t > 0.96 ? 0 : 1),
        transform:
          `translate(${x - startX}px, ${y - startY}px) ` +
          `rotate(${(-12 + 22 * t + Math.sin(t * Math.PI * 3.6) * 6)}deg) ` +
          `scale(${0.80 + Math.sin(Math.PI * t) * 0.16})`
      });
    }

    flyingLeaf.animate(frames, {
      duration: 2100,
      easing: "linear",
      fill: "forwards"
    });
  });

  treeGrowthTimer = setTimeout(() => {
    if (dialog.open) dialog.close();
    dialog.classList.remove("rainbow-bloom");

    if (flyingLeaf) {
      flyingLeaf.getAnimations().forEach(animation => animation.cancel());
      flyingLeaf.style.opacity = "0";
    }

    treeGrowthTimer = null;
  }, 4600);
}

function showRootGrowthCelebration() {
  const dialog = $("#treeGrowthDialog");
  const preview = $("#treeGrowthPreview");
  const tree = $("#treeCanvas");
  const flyingLeaf = $("#flyingLeaf");
  const flyingHeart = $("#flyingHeart");
  const kicker = dialog?.querySelector(".tree-growth-kicker");
  const title = $("#treeGrowthTitle");
  const text = dialog?.querySelector(".tree-growth-copy p");

  if (!dialog || !preview || !tree) return;

  if (treeGrowthTimer) {
    clearTimeout(treeGrowthTimer);
    treeGrowthTimer = null;
  }

  if (kicker) kicker.textContent = "♥ EIN HERZMOMENT STÄRKT EUREN BAUM";
  if (title) title.textContent = "Eine neue Wurzel wächst.";
  if (text) text.textContent = "Schau genau hin – gleich wächst unten eine neue Wurzel.";

  if (flyingLeaf) flyingLeaf.style.display = "none";
  if (flyingHeart) flyingHeart.style.display = "grid";

  const treeClone = tree.cloneNode(true);
  treeClone.removeAttribute("id");
  treeClone.classList.add("tree-growth-canvas", "root-growth-canvas");
  treeClone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));

  const roots = [...treeClone.querySelectorAll(".root-growth-piece")];
  const newestRoot = roots.at(-1);

  newestRoot?.classList.add("new-growth-root", "root-waiting");

  preview.querySelector(".tree-growth-canvas")?.remove();
  preview.appendChild(treeClone);

  let heartTarget = preview.querySelector(".heart-target-pulse");
  if (!heartTarget) {
    heartTarget = document.createElement("div");
    heartTarget.className = "heart-target-pulse";
    preview.appendChild(heartTarget);
  }
  heartTarget.classList.remove("is-pulsing");

  if (!dialog.open) dialog.showModal();

  requestAnimationFrame(() => {
    dialog.classList.remove("rainbow-bloom");
    dialog.classList.add("heart-bloom");

    const previewRect = preview.getBoundingClientRect();
    const baseImage = treeClone.querySelector(".tree-base-image");
    const imageRect = baseImage?.getBoundingClientRect() || treeClone.getBoundingClientRect();

    /*
      Ziel nicht mehr über das gesamte Canvas berechnen,
      sondern direkt über das tatsächlich sichtbare PNG.
      Die rote Markierung liegt am geschnitzten Herz:
      ca. 50 % Breite / 62,7 % Höhe des sichtbaren Baum-PNGs.
    */
    const targetX = imageRect.left + imageRect.width * 0.527 - previewRect.left;
    const targetY = imageRect.top + imageRect.height * 0.640 - previewRect.top;

    heartTarget.style.left = `${targetX}px`;
    heartTarget.style.top = `${targetY}px`;

    if (!flyingHeart) return;

    const startX = previewRect.width * 0.50;
    const startY = Math.max(34, previewRect.height * 0.08);

    flyingHeart.getAnimations().forEach(a => a.cancel());
    flyingHeart.style.opacity = "0";

    const heartAnimation = flyingHeart.animate([
      {
        offset:0,
        opacity:0,
        filter:"brightness(1.35) drop-shadow(0 0 0 rgba(255,223,146,0))",
        transform:`translate(${startX}px, ${startY}px) translate(-50%,-50%) scale(.70)`
      },
      {
        offset:.10,
        opacity:1,
        filter:"brightness(1.42) drop-shadow(0 0 10px rgba(255,216,124,.95)) drop-shadow(0 0 22px rgba(244,157,176,.72))",
        transform:`translate(${startX}px, ${startY}px) translate(-50%,-50%) scale(3.65) rotate(-5deg)`
      },
      {
        offset:.20,
        opacity:1,
        filter:"brightness(1.25) drop-shadow(0 0 7px rgba(255,226,151,.86)) drop-shadow(0 0 16px rgba(244,157,176,.55))",
        transform:`translate(${startX + 5}px, ${startY + 18}px) translate(-50%,-50%) scale(2.85) rotate(4deg)`
      },
      {
        offset:.38,
        opacity:1,
        filter:"brightness(1.12) drop-shadow(0 0 5px rgba(255,220,142,.64))",
        transform:`translate(${startX - 28}px, ${startY + (targetY-startY)*.34}px) translate(-50%,-50%) scale(1.55) rotate(-3deg)`
      },
      {
        offset:.64,
        opacity:1,
        filter:"brightness(1.05) drop-shadow(0 0 3px rgba(255,220,142,.42))",
        transform:`translate(${targetX + 18}px, ${startY + (targetY-startY)*.70}px) translate(-50%,-50%) scale(1.02) rotate(2deg)`
      },
      {
        offset:.90,
        opacity:1,
        filter:"brightness(1) drop-shadow(0 0 2px rgba(255,220,142,.25))",
        transform:`translate(${targetX}px, ${targetY}px) translate(-50%,-50%) scale(.56)`
      },
      {
        offset:1,
        opacity:0,
        filter:"brightness(1)",
        transform:`translate(${targetX}px, ${targetY}px) translate(-50%,-50%) scale(.15)`
      }
    ], {
      duration:3000,
      easing:"cubic-bezier(.20,.72,.18,1)",
      fill:"forwards"
    });

    heartAnimation.finished.then(() => {
      heartTarget.classList.add("is-pulsing");

      if (newestRoot) {
        newestRoot.classList.remove("root-waiting");
        newestRoot.classList.add("root-growing-now");
      }

      if (text) {
        text.textContent = "Da ist sie – diese Wurzel ist gerade dazugekommen.";
      }
    }).catch(() => {});
  });

  treeGrowthTimer = setTimeout(() => {
    if (dialog.open) dialog.close();
    dialog.classList.remove("heart-bloom");

    if (flyingHeart) {
      flyingHeart.getAnimations().forEach(a => a.cancel());
      flyingHeart.style.opacity = "0";
      flyingHeart.style.display = "none";
    }

    preview.querySelector(".heart-target-pulse")?.remove();

    if (flyingLeaf) flyingLeaf.style.display = "block";
    treeGrowthTimer = null;
  }, 6100);
}



const FLOWER_STEPS = [4,8,13,17,22,26,31,36,41,46];

const FLOWER_POSITIONS = [
  [248,116,-8,"#e8a9b8"],
  [382,174,12,"#d8b4df"],
  [152,208,-14,"#efc493"],
  [324,104,7,"#e9a8a2"],
  [436,226,-10,"#cdb9e6"],
  [194,262,11,"#efb9c2"],
  [110,154,-7,"#e8c27d"],
  [356,262,13,"#d7a9c9"],
  [468,174,-12,"#efb1a8"],
  [274,278,6,"#d4b4de"]
];

function renderTreeFlowers() {
  const flowerLayer = $("#flowerLayer");
  if (!flowerLayer) return;

  const leafCount = Math.min((state.learningLeaves || []).length, 50);
  const flowerCount = FLOWER_STEPS.filter(step => leafCount >= step).length;

  flowerLayer.innerHTML = "";

  FLOWER_POSITIONS.slice(0, flowerCount).forEach(([x,y,rot,color], i) => {
    flowerLayer.insertAdjacentHTML("beforeend", `
      <g class="tree-flower" transform="translate(${x} ${y}) rotate(${rot})">
        <g class="tree-flower-shape" style="--flower-delay:${i * 70}ms">
          <ellipse cx="-4" cy="0" rx="4.2" ry="6.3" fill="${color}" opacity=".48"/>
          <ellipse cx="4" cy="0" rx="4.2" ry="6.3" fill="${color}" opacity=".48"/>
          <ellipse cx="0" cy="-4" rx="4.2" ry="6.3" fill="${color}" opacity=".48"/>
          <ellipse cx="0" cy="4" rx="4.2" ry="6.3" fill="${color}" opacity=".48"/>
          <circle cx="0" cy="0" r="2.5" fill="#d9b66a" opacity=".72"/>
        </g>
      </g>
    `);
  });
}

function createGiftButterflyElement(color = "rgba(177,151,211,.62)") {
  const wrap = document.createElement("span");
  wrap.className = "gift-butterfly";
  wrap.style.setProperty("--bf-color", color);
  wrap.style.setProperty("--bf-rot", "0deg");

  wrap.innerHTML = `
    <svg class="gift-butterfly-svg" viewBox="0 0 64 46" aria-hidden="true">
      <g class="gift-butterfly-wings">
        <path class="gift-wing gift-wing-left"
          d="M31 23 C18 1 2 4 5 18 C7 29 18 31 31 25 Z"/>
        <path class="gift-wing gift-wing-right"
          d="M33 23 C46 1 62 4 59 18 C57 29 46 31 33 25 Z"/>
        <path class="gift-wing-lower gift-wing-left-lower"
          d="M30 25 C20 25 11 31 16 40 C23 45 29 35 32 28 Z"/>
        <path class="gift-wing-lower gift-wing-right-lower"
          d="M34 25 C44 25 53 31 48 40 C41 45 35 35 32 28 Z"/>
      </g>
      <path class="gift-butterfly-body" d="M32 14 C29 19 29 30 32 37 C35 30 35 19 32 14 Z"/>
      <path class="gift-butterfly-antenna" d="M31 15 C26 8 22 7 19 7"/>
      <path class="gift-butterfly-antenna" d="M33 15 C38 8 42 7 45 7"/>
    </svg>
  `;
  return wrap;
}

function createGiftSparkles(preview, x, y, amount = 18) {
  const layer = document.createElement("div");
  layer.className = "gift-sparkle-layer";
  preview.appendChild(layer);

  for (let i = 0; i < amount; i++) {
    const s = document.createElement("i");
    s.className = "gift-sparkle";
    const angle = (Math.PI * 2 * i) / amount + Math.random() * .35;
    const distance = 30 + Math.random() * 75;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty("--sx", `${Math.cos(angle) * distance}px`);
    s.style.setProperty("--sy", `${Math.sin(angle) * distance}px`);
    s.style.setProperty("--delay", `${Math.random() * .30}s`);
    s.style.setProperty("--size", `${3 + Math.random() * 6}px`);
    layer.appendChild(s);
  }

  setTimeout(() => layer.remove(), 1800);
}

function showGiftGrowthCelebration() {
  const dialog = $("#treeGrowthDialog");
  const preview = $("#treeGrowthPreview");
  const tree = $("#treeCanvas");
  const flyingLeaf = $("#flyingLeaf");
  const flyingHeart = $("#flyingHeart");
  const kicker = dialog?.querySelector(".tree-growth-kicker");
  const title = $("#treeGrowthTitle");
  const text = dialog?.querySelector(".tree-growth-copy p");

  if (!dialog || !preview || !tree) return;

  if (treeGrowthTimer) {
    clearTimeout(treeGrowthTimer);
    treeGrowthTimer = null;
  }

  if (kicker) kicker.textContent = "🦋 EIN HERZMOMENT WIRD VERSCHENKT";
  if (title) title.textContent = "Ein kleiner Schmetterling entsteht.";
  if (text) text.textContent = "Das Herz findet zuerst seinen Platz im Baum.";

  if (flyingLeaf) flyingLeaf.style.display = "none";
  if (flyingHeart) flyingHeart.style.display = "grid";

  const treeClone = tree.cloneNode(true);
  treeClone.removeAttribute("id");
  treeClone.classList.add("tree-growth-canvas", "gift-growth-canvas");
  treeClone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));

  let butterflies = [...treeClone.querySelectorAll(".gift-butterfly")];
  let newestButterfly = butterflies.at(-1);

  // Sicherheitsnetz: selbst wenn die permanente Ebene noch nicht gerendert wurde,
  // bekommt die Geschenk-Animation immer einen sichtbaren Schmetterling.
  if (!newestButterfly) {
    let layer = treeClone.querySelector(".tree-gift-butterfly-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "tree-gift-butterfly-layer";
      treeClone.appendChild(layer);
    }

    newestButterfly = createGiftButterflyElement("rgba(177,151,211,.66)");
    newestButterfly.style.left = "76%";
    newestButterfly.style.top = "61%";
    newestButterfly.style.setProperty("--bf-rot", "12deg");
    layer.appendChild(newestButterfly);
  }

  newestButterfly.classList.add("new-gift-butterfly", "gift-butterfly-waiting");
  newestButterfly.style.visibility = "hidden";
  newestButterfly.style.opacity = "0";

  preview.querySelector(".tree-growth-canvas")?.remove();
  preview.querySelector(".flying-gift-butterfly-wrap")?.remove();
  preview.querySelector(".flying-gift-butterfly")?.remove();
  preview.appendChild(treeClone);

  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => createTreeMagic(preview, treeClone, { amount:48, duration:4300 }));

  requestAnimationFrame(() => {
    dialog.classList.remove("rainbow-bloom");
    dialog.classList.remove("heart-bloom");
    void dialog.offsetWidth;
    dialog.classList.add("heart-bloom");

    const previewRect = preview.getBoundingClientRect();
    const baseImage = treeClone.querySelector(".tree-base-image");
    const imageRect = baseImage?.getBoundingClientRect() || treeClone.getBoundingClientRect();

    // Gleicher, inzwischen gut passender Herz-Zielpunkt wie beim normalen Herzmoment.
    const heartX = imageRect.left + imageRect.width * 0.527 - previewRect.left;
    const heartY = imageRect.top + imageRect.height * 0.640 - previewRect.top;

    const startX = previewRect.width * 0.50;
    const startY = Math.max(34, previewRect.height * 0.08);

    // Sichtbarer Glitzer schon beim Auftauchen des großen Herzens.
    createGiftSparkles(preview, startX, startY + 18, 22);

    if (!flyingHeart) return;

    flyingHeart.getAnimations().forEach(a => a.cancel());
    flyingHeart.style.opacity = "0";

    const heartAnimation = flyingHeart.animate([
      {
        offset:0,
        opacity:0,
        filter:"brightness(1.45) drop-shadow(0 0 0 rgba(255,223,146,0))",
        transform:`translate(${startX}px, ${startY}px) translate(-50%,-50%) scale(.8)`
      },
      {
        offset:.10,
        opacity:1,
        filter:"brightness(1.65) drop-shadow(0 0 13px rgba(255,241,164,1)) drop-shadow(0 0 30px rgba(255,199,93,.95)) drop-shadow(0 0 48px rgba(239,125,153,.80))",
        transform:`translate(${startX}px, ${startY}px) translate(-50%,-50%) scale(3.5) rotate(-5deg)`
      },
      {
        offset:.22,
        opacity:1,
        filter:"brightness(1.35) drop-shadow(0 0 9px rgba(255,226,151,.86))",
        transform:`translate(${startX + 5}px, ${startY + 20}px) translate(-50%,-50%) scale(2.7) rotate(4deg)`
      },
      {
        offset:.58,
        opacity:1,
        filter:"brightness(1.12) drop-shadow(0 0 5px rgba(255,220,142,.60))",
        transform:`translate(${heartX + 20}px, ${startY + (heartY-startY)*.68}px) translate(-50%,-50%) scale(1.05)`
      },
      {
        offset:.90,
        opacity:1,
        filter:"brightness(1)",
        transform:`translate(${heartX}px, ${heartY}px) translate(-50%,-50%) scale(.56)`
      },
      {
        offset:1,
        opacity:0,
        filter:"brightness(1)",
        transform:`translate(${heartX}px, ${heartY}px) translate(-50%,-50%) scale(.16)`
      }
    ], {
      duration:2900,
      easing:"cubic-bezier(.20,.72,.18,1)",
      fill:"forwards"
    });

    heartAnimation.finished.then(() => {
      createGiftSparkles(preview, heartX, heartY, 26);
      if (text) text.textContent = "Und daraus fliegt ein kleiner Gruß weiter.";

      if (!newestButterfly) return;

      const targetRect = newestButterfly.getBoundingClientRect();
      const butterflyX = targetRect.left + targetRect.width / 2 - previewRect.left;
      const butterflyY = targetRect.top + targetRect.height / 2 - previewRect.top;

      const flyerWrap = document.createElement("span");
      flyerWrap.className = "flying-gift-butterfly-wrap";

      const flyer = createGiftButterflyElement(
        getComputedStyle(newestButterfly).getPropertyValue("--bf-color") ||
        "rgba(177,151,211,.68)"
      );
      flyer.classList.add("flying-gift-butterfly");
      flyer.style.setProperty("--bf-rot", "0deg");

      flyerWrap.appendChild(flyer);
      preview.appendChild(flyerWrap);

      const frames = [];
      const steps = 36;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = heartX + (butterflyX - heartX) * t;
        const yBase = heartY + (butterflyY - heartY) * t;

        // sanfte, gut sichtbare Flugkurve
        const lift = Math.sin(Math.PI * t) * 42;
        const flutter = Math.sin(t * Math.PI * 5.5) * (1 - t) * 8;
        const y = yBase - lift + flutter;

        frames.push({
          offset:t,
          opacity:t < .02 ? 0 : (t > .98 ? 0 : 1),
          transform:
            `translate(${x}px, ${y}px) translate(-50%,-50%) ` +
            `rotate(${Math.sin(t * Math.PI * 4) * 7}deg) ` +
            `scale(${1.18 - .18*t})`
        });
      }

      const butterflyAnimation = flyerWrap.animate(frames, {
        duration:2100,
        easing:"linear",
        fill:"forwards"
      });

      butterflyAnimation.finished.then(() => {
        createGiftSparkles(preview, butterflyX, butterflyY, 14);
        newestButterfly.classList.remove("gift-butterfly-waiting");
        newestButterfly.style.visibility = "visible";
        newestButterfly.classList.add("gift-butterfly-arrived");
        flyerWrap.remove();
        if (text) text.textContent = "Dieser Schmetterling bleibt als kleines Geschenk bei eurem Baum.";
      }).catch(() => flyerWrap.remove());
    }).catch(() => {});
  });

  treeGrowthTimer = setTimeout(() => {
    if (dialog.open) dialog.close();
    dialog.classList.remove("heart-bloom");

    if (flyingHeart) {
      flyingHeart.getAnimations().forEach(a => a.cancel());
      flyingHeart.style.opacity = "0";
      flyingHeart.style.display = "none";
    }

    preview.querySelector(".flying-gift-butterfly-wrap")?.remove();
  preview.querySelector(".flying-gift-butterfly")?.remove();
    if (flyingLeaf) flyingLeaf.style.display = "block";
    treeGrowthTimer = null;
  }, 7600);
}

function renderTreeAttention() {
  const story = $(".tree-story");
  if (!story) return;

  let line = $("#treeAttention");
  if (!line) {
    line = document.createElement("p");
    line.id = "treeAttention";
    line.className = "tree-attention";
    story.insertBefore(line, $("#treeStatus"));
  }

  const seconds = (state.learningLeaves || [])
    .reduce((sum, leaf) => sum + Number(leaf.attentionSeconds || 0), 0);

  line.textContent = seconds > 0
    ? `💛 Dieser Baum hat schon ${formatAttentionMinutes(seconds)} Aufmerksamkeit bekommen.`
    : "💛 Dieser Baum wartet auf seine erste geschenkte Aufmerksamkeit.";
}


if ($("#archiveSearch")) {
  $("#archiveSearch").addEventListener("input", () => renderTaskArchive());
}

if ($("#archiveSearchClear")) {
  $("#archiveSearchClear").onclick = () => {
    const input = $("#archiveSearch");
    if (input) input.value = "";
    renderTaskArchive();
    $("#archiveSearch")?.focus();
  };
}

requestAnimationFrame(updateHeartGiftVisibility);

onAuthStateChanged(auth, async user => {
  if (user) {
    $("#loginView")?.classList.add("hidden");
    $("#appView")?.classList.remove("hidden");

    await ensureSpace();
    await prepareLearningDay();

    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(spaceRef, snap => {
      if (snap.exists()) {
        state = { ...structuredClone(defaultState), ...snap.data() };
        renderAll();
      }
    }, err => alert("Daten konnten nicht geladen werden: " + err.message));
  } else {
    if (unsubscribe) unsubscribe();
    $("#appView")?.classList.add("hidden");
    $("#loginView")?.classList.remove("hidden");
  }
});

$("#loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginMessage").textContent = "Anmeldung läuft …";

  try {
    await signInWithEmailAndPassword(
      auth,
      $("#loginEmail").value.trim(),
      $("#loginPassword").value
    );
    $("#loginPassword").value = "";
    $("#loginMessage").textContent = "";
  } catch {
    $("#loginMessage").textContent =
      "Anmeldung nicht möglich. Bitte E-Mail und Passwort prüfen.";
  }
});

if ($("#logoutBtn")) {
  $("#logoutBtn").onclick = () => signOut(auth);

 setTimeout(decorateTree24a,0);
}

function stopTaskAttention(task, now = Date.now()) {
  const updated = { ...task };

  if (!updated.activeSince) {
    updated.activeSince = null;
    return updated;
  }

  const started = new Date(updated.activeSince).getTime();
  const elapsed = Number.isFinite(started)
    ? Math.max(0, Math.floor((now - started) / 1000))
    : 0;

  updated.attentionSeconds =
    Number(updated.attentionSeconds || 0) +
    Math.min(elapsed, MAX_SESSION_SECONDS);

  updated.activeSince = null;
  return updated;
}

function syncLearningDayUi() {
  const closed = Boolean(state.dayClosed);
  const closingDialog = $("#dayClosingDialog");
  const mamaDialog = $("#mamaDialog");

  $("#startNextDayBtn")?.classList.toggle("hidden", closed);
  $("#reopenLearningDayBtn")?.classList.toggle("hidden", !closed);
  $("#beginNewLearningDayBtn")?.classList.toggle("hidden", !closed);

  if (!closingDialog) return;

  if (closed) {
    if (!closingDialog.open && !mamaDialog?.open) {
      closingDialog.showModal();
    }
  } else if (closingDialog.open) {
    closingDialog.close();
  }
}

async function closeLearningDay() {
  await runTransaction(db, async tx => {
    const snap = await tx.get(spaceRef);
    if (!snap.exists()) return;

    const data = snap.data();
    if (data.dayClosed) return;

    const now = Date.now();
    const stoppedTasks = (data.tasks || []).map(task => stopTaskAttention(task, now));

    const nextTasks = stoppedTasks.map(task =>
      task.done
        ? emptyTask(task.child)
        : { ...task, done: false, activeSince: null }
    );

    tx.update(spaceRef, {
      tasks: [
        ...ensureMinimumTaskSlots(nextTasks, "fina"),
        ...ensureMinimumTaskSlots(nextTasks, "lou")
      ],
      dayClosed: true,
      dayClosedAt: new Date(now).toISOString(),
      dayClosedKey: data.lastLearningDay || learningDayKey(),
      dayClosingBackup: {
        tasks: stoppedTasks,
        dailyMission: data.dailyMission || "",
        lastLearningDay: data.lastLearningDay || learningDayKey()
      },
      updatedAt: serverTimestamp()
    });
  });
}

async function reopenLearningDay() {
  await runTransaction(db, async tx => {
    const snap = await tx.get(spaceRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const backup = data.dayClosingBackup;

    if (!data.dayClosed || !backup?.tasks) return;

    const restoredTasks = backup.tasks.map(task => ({
      ...task,
      activeSince: null
    }));

    tx.update(spaceRef, {
      tasks: [
        ...ensureMinimumTaskSlots(restoredTasks, "fina"),
        ...ensureMinimumTaskSlots(restoredTasks, "lou")
      ],
      dailyMission: backup.dailyMission || data.dailyMission || "",
      lastLearningDay: backup.lastLearningDay || data.lastLearningDay || learningDayKey(),
      dayClosed: false,
      dayClosedAt: null,
      dayClosedKey: null,
      dayClosingBackup: null,
      updatedAt: serverTimestamp()
    });
  });
}

async function beginNewLearningDay() {
  await runTransaction(db, async tx => {
    const snap = await tx.get(spaceRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const now = Date.now();

    const tasks = (data.tasks || []).map(task => ({
      ...stopTaskAttention(task, now),
      done: false,
      activeSince: null
    }));

    tx.update(spaceRef, {
      tasks: [
        ...ensureMinimumTaskSlots(tasks, "fina"),
        ...ensureMinimumTaskSlots(tasks, "lou")
      ],
      dailyMission: chooseDailyMission(data.dailyMission || ""),
      lastLearningDay: learningDayKey(),
      dayClosed: false,
      dayClosedAt: null,
      dayClosedKey: null,
      dayClosingBackup: null,
      manualDayStartedAt: new Date(now).toISOString(),
      updatedAt: serverTimestamp()
    });
  });
}

function renderAll() {
  const now = new Date();
  $("#todayLabel").textContent = now.toLocaleDateString("de-AT", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
  $("#dailyQuote").textContent = state.dailyMission || dailyMissions[0];
  $("#treeTitle").textContent = state.tree?.name || "Unser Wochenbaum";

  renderTasks("fina");
  renderTasks("lou");
  renderTree();

  if (pendingTreeGrowth) {
    pendingTreeGrowth = false;
    requestAnimationFrame(() => showTreeGrowthCelebration());
  } else if (pendingRootGrowth) {
    pendingRootGrowth = false;
    requestAnimationFrame(() => showRootGrowthCelebration());
  } else if (pendingGiftGrowth) {
    pendingGiftGrowth = false;
    requestAnimationFrame(() => showGiftGrowthCelebration());
  }

  renderHearts();
  renderRootMemories();
  renderForest();
  renderAdminRoots();
  renderTreeAttention();
  syncLearningDayUi();
  startAttentionTicker();

  if ($("#heartDate") && !$("#heartDate").value) {
    $("#heartDate").value = learningDayKey();
  }
}

function renderTasks(child) {
  const box = $("#" + child + "Tasks");
  if (!box) return;

  const tasks = (state.tasks || []).filter(t => t.child === child && t.title?.trim());
  box.innerHTML = "";

  if (!tasks.length) {
    box.innerHTML = '<div class="empty">Heute wartet hier nichts auf dich.</div>';
    return;
  }

  tasks.forEach(task => {
    const row = document.createElement("div");
    row.className = "task";

    const running = Boolean(task.activeSince);
    const attention = currentAttentionSeconds(task);
    const hasAttention = attention > 0;

    row.innerHTML = `
      <button class="leaf-toggle ${task.done ? "done" : ""}"
        aria-label="Aufgabe ${task.done ? "wieder öffnen" : "abschließen"}">
        ${leafSvg()}
      </button>

      <div class="task-main">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-note">${escapeHtml(task.note || "")}</div>

        <div class="attention-row">
          <button
            type="button"
            class="attention-toggle ${running ? "running" : ""}"
            aria-label="${running ? "Aufmerksamkeit pausieren" : hasAttention ? "Aufmerksamkeit fortsetzen" : "Aufmerksamkeit starten"}"
            title="${running ? "Pause" : hasAttention ? "Weiter" : "Aufmerksamkeit"}"
          >
            ${running ? "⏸ Pause" : hasAttention ? "▶ Weiter" : "▶ Aufmerksamkeit schenken"}
          </button>

          <span class="attention-time" data-attention-task="${task.id}">
            💛 ${formatAttentionMinutes(attention)}
          </span>
        </div>
      </div>

      ${task.type === "online" && task.url
        ? `<a class="task-link" href="${escapeHtml(task.url)}"
             target="_blank" rel="noopener">Öffnen ↗</a>`
        : ""}
    `;

    row.querySelector(".leaf-toggle").onclick = () => toggleTask(task.id);
    row.querySelector(".attention-toggle").onclick = () => toggleAttention(task.id);
    box.appendChild(row);
  });
}

function getLeafColor(child, difficulty) {
  const configured = state.tree?.leafColors?.[child]?.[difficulty];
  if (configured) return configured;

  return DEFAULT_LEAF_COLORS?.[child]?.[difficulty]
    || DEFAULT_LEAF_COLORS.fina.medium;
}

function askTaskDifficulty(taskId) {
  const task = (state.tasks || []).find(item => item.id === taskId);
  if (!task) return;

  pendingDifficultyTaskId = taskId;

  const dialog = $("#difficultyDialog");
  const title = $("#difficultyTaskTitle");

  if (title) {
    title.textContent = task.title || "Diese Aufgabe";
  }

  if (dialog && !dialog.open) dialog.showModal();
}

async function completeTaskWithDifficulty(taskId, difficulty) {
  let completedNow = false;

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      const data = snap.data();

      const tasks = [...(data.tasks || [])];
      const leaves = [...(data.learningLeaves || [])];
      const archive = [...(data.taskArchive || [])];

      const index = tasks.findIndex(t => t.id === taskId);
      if (index < 0) return;

      const task = { ...tasks[index] };

      if (task.activeSince) {
        const started = new Date(task.activeSince).getTime();
        const elapsed = Number.isFinite(started)
          ? Math.max(0, Math.floor((Date.now() - started) / 1000))
          : 0;

        task.attentionSeconds =
          Number(task.attentionSeconds || 0) +
          Math.min(elapsed, MAX_SESSION_SECONDS);

        task.activeSince = null;
      }

      task.done = true;
      task.difficulty = difficulty;
      tasks[index] = task;

      const alreadyArchived = archive.some(entry => entry.taskId === task.id);

      if (!alreadyArchived) {
        archive.push({
          id: crypto.randomUUID(),
          taskId: task.id,
          child: task.child,
          title: task.title || "",
          note: task.note || "",
          type: task.type || "paper",
          url: task.url || "",
          attentionSeconds: Number(task.attentionSeconds || 0),
          difficulty,
          completedAt: new Date().toISOString()
        });
      }

      const leafIndex = leaves.findIndex(l => l.taskId === taskId);

      if (leafIndex < 0) {
        leaves.push({
          id: crypto.randomUUID(),
          taskId,
          child: task.child,
          title: task.title,
          difficulty,
          color: getLeafColor(task.child, difficulty),
          attentionSeconds: Number(task.attentionSeconds || 0),
          createdAt: (() => {
            const chosen = $("#heartDate")?.value;
            return chosen
              ? new Date(`${chosen}T12:00:00`).toISOString()
              : new Date().toISOString();
          })()
        });

        completedNow = true;
      }

      tx.update(spaceRef, {
        tasks,
        learningLeaves: leaves,
        taskArchive: archive,
        updatedAt: serverTimestamp()
      });
    });

    if (completedNow) pendingTreeGrowth = true;
  } catch (err) {
    alert("Die Aufgabe konnte nicht gespeichert werden: " + err.message);
  }
}

async function toggleTask(taskId) {
  const task = (state.tasks || []).find(item => item.id === taskId);
  if (!task) return;

  // Beim ersten Abschließen fragt das Kind, wie sich die Aufgabe angefühlt hat.
  if (!task.done) {
    askTaskDifficulty(taskId);
    return;
  }

  // Bereits erledigte Aufgabe wieder öffnen.
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      const data = snap.data();

      const tasks = [...(data.tasks || [])];
      const leaves = [...(data.learningLeaves || [])];

      const index = tasks.findIndex(t => t.id === taskId);
      if (index < 0) return;

      tasks[index] = {
        ...tasks[index],
        done: false,
        difficulty: null,
        activeSince: null
      };

      const leafIndex = leaves.findIndex(l => l.taskId === taskId);
      if (leafIndex >= 0) leaves.splice(leafIndex, 1);

      tx.update(spaceRef, {
        tasks,
        learningLeaves: leaves,
        updatedAt: serverTimestamp()
      });
    });
  } catch (err) {
    alert("Die Aufgabe konnte nicht wieder geöffnet werden: " + err.message);
  }
}


const ROOT_GROWTH_LAYOUT = [
  { type:"middle", file:"wurzel-mitte.png",  anchor:50.0, y:0, rot:0,   scale:1.14, opacity:.94, height:22.5 },

  { type:"right",  file:"wurzel-rechts.png", anchor:52.0, y:0, rot:14,  scale:.86, opacity:.86, height:14.5 },
  { type:"left",   file:"wurzel-links.png",  anchor:48.0, y:0, rot:-14, scale:.86, opacity:.86, height:14.5 },

  { type:"right",  file:"wurzel-rechts.png", anchor:53.0, y:1, rot:28,  scale:.84, opacity:.82, height:14.0 },
  { type:"left",   file:"wurzel-links.png",  anchor:47.0, y:1, rot:-28, scale:.84, opacity:.82, height:14.0 },

  { type:"right",  file:"wurzel-rechts.png", anchor:54.0, y:2, rot:42,  scale:.82, opacity:.78, height:13.8 },
  { type:"left",   file:"wurzel-links.png",  anchor:46.0, y:2, rot:-42, scale:.82, opacity:.78, height:13.8 },

  { type:"right",  file:"wurzel-rechts.png", anchor:55.0, y:3, rot:56,  scale:.80, opacity:.74, height:13.5 },
  { type:"left",   file:"wurzel-links.png",  anchor:45.0, y:3, rot:-56, scale:.80, opacity:.74, height:13.5 },

  { type:"right",  file:"wurzel-rechts.png", anchor:56.0, y:4, rot:69,  scale:.78, opacity:.70, height:13.2 },
  { type:"left",   file:"wurzel-links.png",  anchor:44.0, y:4, rot:-69, scale:.78, opacity:.70, height:13.2 },

  { type:"right",  file:"wurzel-rechts.png", anchor:57.0, y:5, rot:80,  scale:.76, opacity:.66, height:13.0 },
  { type:"left",   file:"wurzel-links.png",  anchor:43.0, y:5, rot:-80, scale:.76, opacity:.66, height:13.0 },

  { type:"right",  file:"wurzel-rechts.png", anchor:58.0, y:6, rot:89,  scale:.74, opacity:.62, height:12.8 },
  { type:"left",   file:"wurzel-links.png",  anchor:42.0, y:6, rot:-89, scale:.74, opacity:.62, height:12.8 }
];

function renderRootPngs() {
  const layer = $("#rootPngLayer");
  if (!layer) return;

  const rootCount = Math.min(
    (state.roots || []).filter(root => !root.isGift).length,
    ROOT_GROWTH_LAYOUT.length
  );

  layer.innerHTML = "";

  ROOT_GROWTH_LAYOUT.slice(0, rootCount).forEach((cfg, index) => {
    const img = document.createElement("img");

    img.className = `root-png root-growth-piece root-${cfg.type}`;
    img.src = cfg.file;
    img.alt = "";
    img.draggable = false;

    img.style.left = `${cfg.anchor}%`;
    img.style.setProperty("--root-y", `${cfg.y}px`);
    img.style.setProperty("--root-rot", `${cfg.rot}deg`);
    img.style.setProperty("--root-scale", cfg.scale);
    img.style.setProperty("--root-opacity", cfg.opacity);
    img.style.setProperty("--root-height", `${cfg.height}%`);
    img.dataset.rootOrder = String(index + 1);
    img.style.setProperty(
      "--root-delay",
      `${Math.min(index * 30, 160)}ms`
    );

    layer.appendChild(img);
  });
}

const GIFT_BUTTERFLY_POSITIONS = [
  [24,58,-12],[76,58,13],
  [19,64,-6],[81,64,8],
  [28,69,10],[72,69,-10],
  [22,73,7],[78,73,-7],
  [33,61,-15],[67,61,15],
  [17,69,-10],[83,69,10]
];
const GIFT_BUTTERFLY_COLORS = [
  [219,145,166],[177,151,211],[123,178,199],[224,176,91],[141,181,137],[203,154,116]
];

function renderGiftButterflies() {
  const tree = $("#treeCanvas");
  if (!tree) return;

  let layer = $("#giftButterflyLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "giftButterflyLayer";
    layer.className = "tree-gift-butterfly-layer";
    layer.setAttribute("aria-hidden", "true");
    tree.appendChild(layer);
  }

  layer.innerHTML = "";

  const gifts = (state.roots || []).filter(root => root.isGift);

  gifts.slice(0, GIFT_BUTTERFLY_POSITIONS.length).forEach((gift, i) => {
    const [x,y,rot] = GIFT_BUTTERFLY_POSITIONS[i];
    const [r,g,b] = GIFT_BUTTERFLY_COLORS[i % GIFT_BUTTERFLY_COLORS.length];

    const el = createGiftButterflyElement(`rgba(${r},${g},${b},.62)`);
    el.dataset.giftIndex = String(i);
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.setProperty("--bf-rot", `${rot}deg`);
    el.title = `${gift.author || "Jemand"} → ${gift.recipient || "jemand"}`;

    layer.appendChild(el);
  });
}

function renderTree() {
  const leafLayer = $("#leafLayer");
  if (!leafLayer) return;

  leafLayer.innerHTML = "";

  const leaves = (state.learningLeaves || []).slice(0, leafPositions.length);

  leaves.forEach((leaf, i) => {
    const [x, y, rot, mirror] = leafPositions[i];
    const color = leaf.color || getLeafColor(
      leaf.child || "fina",
      leaf.difficulty || "medium"
    );
    const highlight = "#f7f4ea";

    leafLayer.insertAdjacentHTML("beforeend", `
      <g
        transform="translate(${x} ${y}) rotate(${rot}) scale(1 ${mirror})"
        class="dynamic-leaf"
      >
        <g class="leaf-shape">
          <path
            class="leaf-shadow"
            d="M1 1 C8 -13 21 -18 33 -9 C30 7 17 14 1 1Z"
          />
          <path
            class="leaf-body"
            d="M0 0
               C5 -6 10 -10 16 -13
               C22 -15 27 -13 31 -9
               C28 -3 24 2 19 6
               C13 9 7 7 0 0 Z"
            fill="${color}"
          />
          <path
            class="leaf-soft-light"
            d="M7 -2 C13 -6 20 -9 27 -9"
            stroke="${highlight}"
          />
          <path
            class="leaf-vein"
            d="M4 1 C11 -1 18 -4 27 -9"
          />
          <path
            class="leaf-vein leaf-vein-small"
            d="M12 -2 C11 -5 11 -8 12 -10"
          />
          <path
            class="leaf-vein leaf-vein-small"
            d="M17 -5 C20 -5 23 -4 25 -5"
          />
          <path
            class="leaf-vein leaf-vein-small"
            d="M22 -7 C24 -9 25 -10 26 -11"
          />
        </g>
      </g>
    `);
  });

  renderRootPngs();
  renderGiftButterflies();
  requestAnimationFrame(() => renderGiftButterflies());

  const target = Number(state.tree?.targetLeaves || 20);
  const complete = leaves.length >= target;

  $("#treeStatus").textContent = complete
    ? "Die Krone ist vollständig gewachsen. Dieser Baum darf in den Lernwald ziehen."
    : "Der Baum wächst still mit euren Lernaufgaben und Herzmomenten.";

  $("#finishTreeBtn")?.classList.toggle("hidden", !complete);

  renderTreeFlowers();
}

function renderHearts() {
  const box = $("#heartChoices");
  if (!box) return;

  box.innerHTML = "";

  heartOptions.forEach(opt => {
    const btn = document.createElement("button");
    const selected = selectedHearts.includes(opt.key);

    btn.type = "button";
    btn.className = "heart-choice" + (selected ? " selected" : "");
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    btn.innerHTML = `
      <span class="heart-icon">${opt.icon}</span>
      <strong>${opt.title}</strong>
      <span>${opt.text}</span>
    `;

    btn.onclick = () => {
      selectedHearts = selected
        ? selectedHearts.filter(x => x !== opt.key)
        : [...selectedHearts, opt.key];

      renderHearts();
    };

    box.appendChild(btn);
  });

  const otherSelected = selectedHearts.includes("other");
  $("#heartOtherField")?.classList.toggle("hidden", !otherSelected);
}

function updateHeartNoteVisibility() {
  const noteField = $("#heartNoteField");

  if (!noteField) return;

  noteField.classList.remove("hidden");
}

if ($("#heartAuthor")) {
  $("#heartAuthor").addEventListener("change", updateHeartNoteVisibility);
  updateHeartNoteVisibility();
}

function updateHeartGiftVisibility() {
  const isGift = !!$("#heartGiftToggle")?.checked;
  const recipient = $("#heartGiftRecipientField");

  if (recipient) {
    recipient.classList.toggle("hidden", !isGift);
    recipient.style.display = isGift ? "flex" : "none";
  }

  const button = $("#addRootBtn");
  if (button) {
    button.textContent = isGift
      ? "🦋 Herzmoment verschenken"
      : "🌱 Eine Wurzel wachsen lassen";
  }
}

if ($("#heartGiftToggle")) {
  $("#heartGiftToggle").addEventListener("change", updateHeartGiftVisibility);
  updateHeartGiftVisibility();
}

if ($("#addRootBtn")) {
  $("#addRootBtn").onclick = async () => {
    const reason = $("#heartReason")?.value.trim() || "";
    const otherText = $("#heartOtherText")?.value.trim() || "";
    const isGift = !!$("#heartGiftToggle")?.checked;
    const recipient = isGift ? ($("#heartGiftRecipient")?.value || "Mama") : "";

    if (!selectedHearts.length) {
      alert("Wählt mindestens einen Herzmoment aus.");
      return;
    }

    if (selectedHearts.includes("other") && !otherText) {
      alert("Schreibt bei Sonstiges kurz dazu, welcher Herzmoment gemeint ist.");
      $("#heartOtherText")?.focus();
      return;
    }

    // Ein eigener Herzmoment stärkt den Baum als Wurzel.
    // Ein verschenkter Herzmoment bekommt bewusst ein anderes Symbol: einen Schmetterling.
    pendingRootGrowth = !isGift;
    pendingGiftGrowth = isGift;

    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(spaceRef);
        const roots = [...(snap.data().roots || [])];

        roots.push({
          id: crypto.randomUUID(),
          kinds: [...selectedHearts],
          author: $("#heartAuthor")?.value || "Gemeinsam",
          reason,
          otherText,
          isGift,
          recipient,
          createdAt: (() => {
            const chosen = $("#heartDate")?.value;
            return chosen ? new Date(`${chosen}T12:00:00`).toISOString() : new Date().toISOString();
          })()
        });

        tx.update(spaceRef, {
          roots,
          updatedAt: serverTimestamp()
        });
      });

      selectedHearts = [];
      if ($("#heartReason")) $("#heartReason").value = "";
      if ($("#heartOtherText")) $("#heartOtherText").value = "";
      if ($("#heartGiftToggle")) $("#heartGiftToggle").checked = false;
      updateHeartGiftVisibility();
      renderHearts();
    } catch (err) {
      pendingRootGrowth = false;
      pendingGiftGrowth = false;
      alert("Der Herzmoment konnte nicht gespeichert werden: " + err.message);
    }
  };
}

function renderRootMemories() {
  const box = $("#rootMemory");
  if (!box) return;

  const roots = (state.roots || []).slice().reverse().slice(0, 4);
  box.innerHTML = "";

  if (!roots.length) return;

  roots.forEach(root => {
    const labels = (root.kinds || [])
      .map(k => k === "other" && root.otherText ? root.otherText : (heartOptions.find(x => x.key === k)?.title || k))
      .join(", ");

    box.insertAdjacentHTML("beforeend", `
      <div class="memory-card">
        <strong>${root.isGift ? "🦋" : "🌱"} ${escapeHtml(root.author || "Gemeinsam")}${root.isGift ? ` → ${escapeHtml(root.recipient || "")}` : ""}: ${escapeHtml(labels)}</strong>
        ${root.reason ? `<div>${escapeHtml(root.reason)}</div>` : ""}
        <small>${new Date(root.createdAt).toLocaleDateString("de-AT")}</small>
      </div>
    `);
  });
}

function ensureAdminRootsPanel() {
  const panel = $("#treeTab");
  if (!panel) return;

  let section = $("#adminRootsPanel");

  // Falls eine ältere Version den Bereich außerhalb des Tabs angelegt hat:
  if (section && section.parentElement !== panel) {
    section.remove();
    section = null;
  }

  if (!section) {
    section = document.createElement("section");
    section.id = "adminRootsPanel";
    section.className = "admin-roots-panel";
    section.innerHTML = `
      <div class="admin-roots-heading">
        <div>
          <h3>🌱 Gespeicherte Herzmomente & Wurzeln</h3>
          <p class="muted">Hier kannst du versehentlich angelegte Einträge löschen.</p>
        </div>
      </div>
      <div id="adminRootsList"></div>
    `;
    panel.appendChild(section);
  }
}

function renderAdminRoots() {
  const list = $("#adminRootsList");
  if (!list) return;

  const roots = (state.roots || []).slice().reverse();
  list.innerHTML = "";

  if (!roots.length) {
    list.innerHTML = '<div class="empty">Noch keine Wurzeln gespeichert.</div>';
    return;
  }

  roots.forEach(root => {
    const labels = (root.kinds || [])
      .map(k => k === "other" && root.otherText ? root.otherText : (heartOptions.find(x => x.key === k)?.title || k))
      .join(", ");

    const row = document.createElement("div");
    row.className = "memory-card";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "flex-start";
    row.style.gap = "12px";

    row.innerHTML = `
      <div>
        <strong>${root.isGift ? "🦋" : "🌱"} ${escapeHtml(root.author || "Gemeinsam")}${root.isGift ? ` → ${escapeHtml(root.recipient || "")}` : ""}: ${escapeHtml(labels)}</strong>
        ${root.reason ? `<div>${escapeHtml(root.reason)}</div>` : ""}
        <small>${new Date(root.createdAt).toLocaleDateString("de-AT")}</small>
      </div>
      <button type="button" class="remove-task" title="Wurzel löschen"
        aria-label="Wurzel löschen">🗑️</button>
    `;

    row.querySelector("button").onclick = () => deleteRoot(root.id);
    list.appendChild(row);
  });
}

async function deleteRoot(rootId) {
  const root = (state.roots || []).find(r => r.id === rootId);
  if (!root) return;

  if (!confirm("Soll diese Wurzel wirklich gelöscht werden?")) return;

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      const roots = (snap.data().roots || []).filter(r => r.id !== rootId);

      tx.update(spaceRef, {
        roots,
        updatedAt: serverTimestamp()
      });
    });
  } catch (err) {
    alert("Die Wurzel konnte nicht gelöscht werden: " + err.message);
  }
}

async function sendCurrentTreeToForest({ force = false } = {}) {
  const target = Math.max(1, Math.min(50, Number(state.tree?.targetLeaves || 24)));
  const currentLeaves = (state.learningLeaves || []).length;

  if (!force && currentLeaves < target) return;

  const name = state.tree?.name || "Unser Wochenbaum";
  const message = force && currentLeaves < target
    ? `„${name}“ hat aktuell ${currentLeaves} von ${target} Lernblättern. Trotzdem jetzt in den Lernwald setzen?`
    : `Soll „${name}“ in den Lernwald wandern?`;

  if (!confirm(message)) return;

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      const data = snap.data();
      const forest = [...(data.forest || [])];

      forest.push({
        id: crypto.randomUUID(),
        name: data.tree?.name || "Wochenbaum",
        completedAt: new Date().toISOString(),
        leaves: (data.learningLeaves || []).length,
        roots: structuredClone(data.roots || []),

        // Ab 2.4h wird ein vollständiger Schnappschuss gespeichert.
        // Dadurch kann der Baum später wirklich wieder aktiviert werden.
        snapshot: {
          tree: structuredClone(data.tree || {}),
          learningLeaves: structuredClone(data.learningLeaves || []),
          roots: structuredClone(data.roots || []),
          tasks: structuredClone(data.tasks || [])
        }
      });

      const tasks = (data.tasks || []).map(t => ({ ...t, done: false }));

      tx.update(spaceRef, {
        forest,
        learningLeaves: [],
        roots: [],
        tasks,
        tree: {
          ...data.tree,
          name: "Neuer Wochenbaum",
          startedAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      });
    });

    alert("✓ Der Baum ist jetzt im Lernwald.");
  } catch (err) {
    alert("Der Baum konnte nicht in den Lernwald gesetzt werden: " + err.message);
  }
}

if ($("#finishTreeBtn")) {
  $("#finishTreeBtn").onclick = () => sendCurrentTreeToForest({ force: false });
}

if ($("#adminFinishTreeBtn")) {
  $("#adminFinishTreeBtn").onclick = () => sendCurrentTreeToForest({ force: true });
}

if ($("#openForest")) {
  $("#openForest").onclick = () => $("#forestSection")?.classList.remove("hidden");
}

if ($("#closeForest")) {
  $("#closeForest").onclick = () => $("#forestSection")?.classList.add("hidden");
}

async function restoreTreeFromForest(treeId) {
  const archived = (state.forest || []).find(tree => tree.id === treeId);
  if (!archived) return;

  if (!archived.snapshot) {
    alert("Dieser ältere Lernwald-Baum wurde noch ohne vollständigen Schnappschuss gespeichert. Seine Wurzeln sind vorhanden, aber Lernblätter und Aufgaben lassen sich nicht zuverlässig zurückholen.");
    return;
  }

  const activeName = state.tree?.name || "aktueller Baum";
  const ok = confirm(
    `„${archived.name || "Dieser Baum"}“ wieder aktivieren?\n\n` +
    `Der derzeit aktive Baum „${activeName}“ wird vorher automatisch sicher im Lernwald abgelegt.`
  );
  if (!ok) return;

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      const data = snap.data();
      const forest = [...(data.forest || [])];

      const targetIndex = forest.findIndex(tree => tree.id === treeId);
      if (targetIndex < 0) return;

      const target = forest[targetIndex];
      if (!target.snapshot) throw new Error("Für diesen Baum gibt es keinen vollständigen Schnappschuss.");

      // Den derzeit aktiven Baum nicht verlieren:
      const currentHasContent =
        (data.learningLeaves || []).length > 0 ||
        (data.roots || []).length > 0 ||
        (data.tasks || []).some(task => task.done);

      if (currentHasContent) {
        forest.push({
          id: crypto.randomUUID(),
          name: data.tree?.name || "Zwischengespeicherter Baum",
          completedAt: new Date().toISOString(),
          leaves: (data.learningLeaves || []).length,
          roots: structuredClone(data.roots || []),
          paused: true,
          snapshot: {
            tree: structuredClone(data.tree || {}),
            learningLeaves: structuredClone(data.learningLeaves || []),
            roots: structuredClone(data.roots || []),
            tasks: structuredClone(data.tasks || [])
          }
        });
      }

      // Wieder aktivierter Baum verschwindet aus dem Lernwald,
      // weil er nun wieder der aktuelle Baum ist.
      forest.splice(targetIndex, 1);

      tx.update(spaceRef, {
        forest,
        tree: structuredClone(target.snapshot.tree || {}),
        learningLeaves: structuredClone(target.snapshot.learningLeaves || []),
        roots: structuredClone(target.snapshot.roots || []),
        tasks: structuredClone(target.snapshot.tasks || []),
        updatedAt: serverTimestamp()
      });
    });

    $("#forestSection")?.classList.add("hidden");
    alert("✓ Der Baum ist wieder aktiv.");
  } catch (err) {
    alert("Der Baum konnte nicht zurückgeholt werden: " + err.message);
  }
}

function renderForest() {
  const box = $("#forestGrid");
  if (!box) return;

  const forest = (state.forest || []).slice().reverse();
  box.innerHTML = "";

  if (!forest.length) {
    box.innerHTML = '<div class="empty">Hier wartet euer erster fertiger Baum.</div>';
    return;
  }

  forest.forEach(tree => {
    const canRestore = !!tree.snapshot;
    box.insertAdjacentHTML("beforeend", `
      <article class="forest-tree">
        <div class="tree-emoji">🌳</div>
        <strong>${escapeHtml(tree.name)}</strong>
        <div class="muted">
          ${new Date(tree.completedAt).toLocaleDateString("de-AT", {
            month: "long", year: "numeric"
          })}
        </div>
        <small>${tree.roots?.length || 0} Herzmomente begleiten diesen Baum.</small>
        ${tree.paused ? '<span class="forest-paused-note">Zwischengespeichert</span>' : ""}
        ${
          canRestore
            ? `<button type="button" class="forest-restore-btn" data-restore-tree="${escapeHtml(tree.id)}">↩ Baum wieder aktivieren</button>`
            : `<span class="forest-old-note">Älterer Baum – nur Ansicht</span>`
        }
      </article>
    `);
  });

  $$("[data-restore-tree]").forEach(btn => {
    btn.onclick = () => restoreTreeFromForest(btn.dataset.restoreTree);
  });
}

$$("[data-difficulty]").forEach(btn => {
  btn.onclick = async () => {
    if (!pendingDifficultyTaskId) return;

    const taskId = pendingDifficultyTaskId;
    pendingDifficultyTaskId = null;

    $("#difficultyDialog")?.close();
    await completeTaskWithDifficulty(taskId, btn.dataset.difficulty);
  };
});

$("#difficultyDialog")?.addEventListener("cancel", event => {
  event.preventDefault();
  pendingDifficultyTaskId = null;
  $("#difficultyDialog")?.close();
});

// Baumpfleger-Bereich
function openMamaDialog() {
  $("#dayClosingDialog")?.close();

  $("#mamaUnlock")?.classList.remove("hidden");
  $("#mamaPanel")?.classList.add("hidden");

  if ($("#mamaEmail") && auth.currentUser?.email) {
    $("#mamaEmail").value = auth.currentUser.email;
  }

  if ($("#mamaPassword")) $("#mamaPassword").value = "";
  if ($("#mamaUnlockMessage")) $("#mamaUnlockMessage").textContent = "";

  $("#mamaDialog")?.showModal();

  requestAnimationFrame(() => {
    bindMamaTabs();
    activateMamaTab("tasksTab");
  });
}

if ($("#openMama")) {
  $("#openMama").onclick = openMamaDialog;
}

if ($("#openMamaFromClosingBtn")) {
  $("#openMamaFromClosingBtn").onclick = openMamaDialog;
}

$("#mamaDialog")?.addEventListener("close", () => {
  if (state.dayClosed) syncLearningDayUi();
});

$("#dayClosingDialog")?.addEventListener("cancel", event => {
  event.preventDefault();
});

$("#treeGrowthDialog")?.addEventListener("cancel", event => {
  event.preventDefault();
});

$("#treeGrowthDialog")?.addEventListener("click", event => {
  if (event.target !== $("#treeGrowthDialog")) return;

  if (treeGrowthTimer) {
    clearTimeout(treeGrowthTimer);
    treeGrowthTimer = null;
  }

  $("#treeGrowthDialog")?.close();
});

if ($("#unlockMamaBtn")) {
  $("#unlockMamaBtn").onclick = async () => {
    const password = $("#mamaPassword")?.value || "";
    const email = $("#mamaEmail")?.value.trim() || auth.currentUser?.email || "";

    if (!email || !password) {
      $("#mamaUnlockMessage").textContent =
        "Bitte E-Mail-Adresse und Passwort eingeben.";
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      $("#mamaUnlock")?.classList.add("hidden");
      $("#mamaPanel")?.classList.remove("hidden");

      bindMamaTabs();
      activateMamaTab("tasksTab");
      prepareAdmin();
    } catch {
      $("#mamaUnlockMessage").textContent = "E-Mail-Adresse oder Passwort stimmt nicht.";
    }
  };
}


function activateMamaTab(tabId) {
  const valid = ["tasksTab", "treeTab", "archiveTab"];
  const wanted = valid.includes(tabId) ? tabId : "tasksTab";

  $$("#mamaPanel .tab").forEach(btn => {
    const active = btn.dataset.tab === wanted;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  $$("#mamaPanel .tab-panel").forEach(panel => {
    panel.classList.toggle("hidden", panel.id !== wanted);
  });

  if (wanted === "treeTab") {
    ensureAdminRootsPanel();
    renderAdminRoots();
  }

  if (wanted === "archiveTab") {
    renderTaskArchive();
    requestAnimationFrame(() => $("#archiveSearch")?.focus());
  }
}

function bindMamaTabs() {
  $$("#mamaPanel .tab[data-tab]").forEach(btn => {
    btn.onclick = () => activateMamaTab(btn.dataset.tab);
  });
}

function prepareAdmin() {
  adminDraft = {
    fina: ensureMinimumTaskSlots(state.tasks || [], "fina"),
    lou: ensureMinimumTaskSlots(state.tasks || [], "lou")
  };

  if ($("#treeNameInput")) $("#treeNameInput").value = state.tree?.name || "";
  if ($("#treeTargetInput")) {
    const target = Math.max(1, Math.min(50, Number(state.tree?.targetLeaves || 24)));
    const presetValues = ["12","16","20","24","30","35","40","45","50"];
    const asString = String(target);

    if (presetValues.includes(asString)) {
      $("#treeTargetInput").value = asString;
      $("#treeTargetCustomWrap")?.classList.add("hidden");
    } else {
      $("#treeTargetInput").value = "custom";
      if ($("#treeTargetCustom")) $("#treeTargetCustom").value = String(target);
      $("#treeTargetCustomWrap")?.classList.remove("hidden");
    }
  }

  const leafColors = state.tree?.leafColors || DEFAULT_LEAF_COLORS;

  if ($("#finaEasyColor")) $("#finaEasyColor").value = leafColors.fina?.easy || DEFAULT_LEAF_COLORS.fina.easy;
  if ($("#finaMediumColor")) $("#finaMediumColor").value = leafColors.fina?.medium || DEFAULT_LEAF_COLORS.fina.medium;
  if ($("#finaTrickyColor")) $("#finaTrickyColor").value = leafColors.fina?.tricky || DEFAULT_LEAF_COLORS.fina.tricky;

  if ($("#louEasyColor")) $("#louEasyColor").value = leafColors.lou?.easy || DEFAULT_LEAF_COLORS.lou.easy;
  if ($("#louMediumColor")) $("#louMediumColor").value = leafColors.lou?.medium || DEFAULT_LEAF_COLORS.lou.medium;
  if ($("#louTrickyColor")) $("#louTrickyColor").value = leafColors.lou?.tricky || DEFAULT_LEAF_COLORS.lou.tricky;

  renderAdminTasks("fina");
  renderAdminTasks("lou");
  ensureAdminRootsPanel();
  renderAdminRoots();
  renderTaskArchive();
  bindMamaTabs();
}

function renderAdminTasks(child) {

  const box = $("#admin" + (child === "fina" ? "Fina" : "Lou") + "Tasks");
  if (!box) return;

  box.innerHTML = "";

  adminDraft[child].forEach((task, index) => {
    const row = document.createElement("div");
    row.className = "admin-task";

    const totalMinutes = Math.max(
      0,
      Math.floor(currentAttentionSeconds(task) / 60)
    );

    row.innerHTML = `
      <input data-field="title" value="${escapeHtml(task.title)}" placeholder="Aufgabe">

      <select data-field="type">
        <option value="paper" ${task.type === "paper" ? "selected" : ""}>Papier</option>
        <option value="online" ${task.type === "online" ? "selected" : ""}>Lernhomepage</option>
        <option value="free" ${task.type === "free" ? "selected" : ""}>Freie Aufgabe</option>
      </select>

      <div class="task-order-buttons">
  <button type="button" class="move-task-up" title="Nach oben">↑</button>
  <button type="button" class="move-task-down" title="Nach unten">↓</button>
  <button type="button" class="remove-task" title="Aufgabe entfernen">✕</button>
</div>

      <input class="full" data-field="note" value="${escapeHtml(task.note || "")}"
        placeholder="Kurze Anweisung">

      <input class="full" data-field="url" value="${escapeHtml(task.url || "")}"
        placeholder="Link – nur bei Lernhomepage">

      <div class="attention-admin full">
        <label>
          💛 Aufmerksamkeit in Minuten
          <input
            type="number"
            min="0"
            max="9999"
            step="1"
            data-attention-minutes
            value="${totalMinutes}"
          >
        </label>

        ${task.activeSince
          ? '<span class="attention-running-note">⏸ Läuft gerade</span>'
          : ""
        }
      </div>
    `;

    row.querySelectorAll("[data-field]").forEach(el => {
      el.oninput = () => {
        adminDraft[child][index][el.dataset.field] = el.value;
      };
    });

    const minutesInput = row.querySelector("[data-attention-minutes]");
    minutesInput.oninput = () => {
      const minutes = Math.max(0, Math.floor(Number(minutesInput.value || 0)));
      adminDraft[child][index].attentionSeconds = minutes * 60;
      adminDraft[child][index].activeSince = null;
    };
row.querySelector(".move-task-up").onclick = () => {
  if (index === 0) return;

  [adminDraft[child][index - 1], adminDraft[child][index]] =
    [adminDraft[child][index], adminDraft[child][index - 1]];

renderAdminTasks(child);
alert("✓ Aufgabe wurde zu „Heute planen“ hinzugefügt.");
};

row.querySelector(".move-task-down").onclick = () => {
  if (index === adminDraft[child].length - 1) return;

  [adminDraft[child][index + 1], adminDraft[child][index]] =
    [adminDraft[child][index], adminDraft[child][index + 1]];

  renderAdminTasks(child);
};
    row.querySelector(".remove-task").onclick = () => {
      adminDraft[child].splice(index, 1);
      adminDraft[child] = ensureMinimumTaskSlots(adminDraft[child], child);
      renderAdminTasks(child);
    };

  box.appendChild(row);
});
}

function normalizeArchiveSearch(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function renderTaskArchive() {
  const box = $("#taskArchiveList");
  if (!box) return;

  const query = normalizeArchiveSearch($("#archiveSearch")?.value || "");
  const archive = [...(state.taskArchive || [])].sort((a,b) =>
    new Date(b.completedAt || 0) - new Date(a.completedAt || 0)
  );

  const filtered = query
    ? archive.filter(item => {
        const haystack = normalizeArchiveSearch([
          item.title,
          item.note,
          item.url,
          item.child,
          item.type
        ].filter(Boolean).join(" "));
        return haystack.includes(query);
      })
    : archive;

  box.innerHTML = "";

  const info = $("#archiveSearchInfo");
  if (info) {
    info.textContent = query
      ? `${filtered.length} von ${archive.length} Einträgen gefunden`
      : `${archive.length} gespeicherte Aufgaben`;
  }

  if (!filtered.length) {
    box.innerHTML = query
      ? '<div class="empty">Keine passende frühere Aufgabe gefunden.</div>'
      : '<div class="empty">Noch keine erledigten Aufgaben im Archiv.</div>';
    return;
  }

  filtered.forEach(item => {
    const date = item.completedAt
      ? new Date(item.completedAt).toLocaleDateString("de-AT")
      : "";

    box.insertAdjacentHTML("beforeend", `
      <article class="archive-task archive-task-compact">
        <div class="archive-task-topline">
          <span class="archive-task-meta">
            ${item.child === "fina" ? "🌸 Fina" : "🌺 Lou"}${date ? ` · ${date}` : ""}
          </span>
          <span class="archive-task-time">
            ${Number(item.attentionSeconds || 0) > 0
              ? `💛 ${formatAttentionMinutes(item.attentionSeconds)}`
              : "💛 0 Min."}
          </span>
        </div>

        <strong class="archive-task-title">${escapeHtml(item.title || "Ohne Titel")}</strong>

        ${item.note ? `<div class="archive-task-note">${escapeHtml(item.note)}</div>` : ""}

        ${item.url ? `
          <div class="archive-task-link-line">
            <span>🔗</span>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
              ${escapeHtml(item.url)}
            </a>
          </div>
        ` : ""}

        <div class="archive-task-bottomline">
          <span class="archive-task-difficulty">
            ${item.difficulty
              ? `Schwierigkeit: ${escapeHtml(item.difficulty)}`
              : "Schwierigkeit nicht erfasst"}
          </span>

          <button
            type="button"
            class="reuse-archive-task"
            data-reuse-archive="${escapeHtml(item.id)}"
          >
            ↻ Wiederverwenden
          </button>
        </div>
      </article>
    `);
  });

  $$("[data-reuse-archive]").forEach(btn => {
    btn.onclick = () => reuseArchivedTask(btn.dataset.reuseArchive);
  });
}
