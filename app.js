import {
  auth, db, spaceRef, defaultState,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ensureSpace, onSnapshot, updateDoc, runTransaction, serverTimestamp
} from "./firebase.js";

const APP_VERSION = "2.4b Feinabstimmung Herz & Wurzel";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let state = structuredClone(defaultState);
let unsubscribe = null;
let selectedHearts = [];
let adminDraft = { fina: [], lou: [] };
let attentionTicker = null;
let pendingTreeGrowth = false;
let pendingRootGrowth = false;
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
  { key: "respect", icon: "🤍", title: "Rücksicht", text: "Auf jemanden Rücksicht genommen" }
];

const leafPositions = [
  [70,170,-42,1],[96,190,133,-1],[118,154,18,1],[139,210,171,-1],
  [158,177,-61,1],[178,226,118,-1],[167,128,33,1],[192,151,146,-1],
  [214,190,-23,1],[221,111,74,-1],[244,145,156,-1],[254,72,-11,1],
  [279,102,109,-1],[299,139,-53,1],[321,72,37,1],[339,111,198,-1],
  [360,139,7,1],[383,112,242,-1],[405,157,54,1],[425,126,183,-1],
  [443,180,-17,1],[465,153,227,-1],[487,200,68,1],[507,169,151,-1],
  [112,242,-71,1],[160,257,126,-1],[207,239,31,1],[352,244,94,1],
  [402,257,214,-1],[454,238,-38,1]
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

const TREE_LEAF_LAYOUT_50=[
[49,12,-8],[42,15,-24],[57,15,20],[35,19,-38],[64,19,34],[47,21,12],[53,22,-18],[29,24,-54],[70,24,48],[39,26,31],
[60,27,-32],[23,29,-67],[76,29,62],[33,31,-18],[49,31,45],[66,32,15],[18,34,-78],[81,35,76],[27,37,28],[42,37,-42],
[57,38,38],[72,39,-16],[14,41,-86],[85,42,84],[34,43,55],[50,44,-12],[64,45,-51],[22,47,12],[77,48,45],[30,50,-35],
[44,50,26],[58,51,-24],[69,52,61],[17,54,-72],[83,55,70],[26,57,43],[38,57,-58],[52,58,17],[63,59,-39],[74,60,33],
[21,63,-48],[32,64,68],[46,64,-21],[58,65,52],[69,66,-62],[79,67,44],[28,69,-17],[40,70,36],[55,70,-46],[66,71,18]
];
const TREE_FLOWERS=[[45,17],[62,22],[31,28],[72,34],[22,42],[55,43],[35,52],[76,54],[47,61],[64,66]];
function decorateTree24a(){
 const leaves=[...document.querySelectorAll("#treeLeafOverlay > *")];
 leaves.slice(0,50).forEach((el,i)=>{const p=TREE_LEAF_LAYOUT_50[i];if(!p)return;el.style.left=p[0]+"%";el.style.top=p[1]+"%";el.style.transform=`translate(-50%,-50%) rotate(${p[2]}deg)`;});
 const o=document.querySelector("#treeFlowerOverlay");if(!o)return;
 const n=Math.min(10,Math.floor(Math.min(50,leaves.length)/5));
 o.innerHTML=TREE_FLOWERS.slice(0,n).map((p,i)=>`<span class="tree-tiny-flower" style="left:${p[0]}%;top:${p[1]}%">✿</span>`).join("");
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
  }

  renderHearts();
  renderRootMemories();
  renderForest();
  renderAdminRoots();
  renderTreeAttention();
  syncLearningDayUi();
  startAttentionTicker();
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
          createdAt: new Date().toISOString()
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
    (state.roots || []).length,
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
               C5 -7 11 -12 18 -14
               C24 -16 30 -13 34 -9
               C31 -2 27 4 21 8
               C14 11 7 8 0 0 Z"
            fill="${color}"
          />
          <path
            class="leaf-soft-light"
            d="M7 -2 C13 -6 20 -9 27 -9"
            stroke="${highlight}"
          />
          <path
            class="leaf-vein"
            d="M4 1 C12 -1 20 -5 29 -10"
          />
          <path
            class="leaf-vein leaf-vein-small"
            d="M12 -2 C11 -5 11 -8 12 -10"
          />
          <path
            class="leaf-vein leaf-vein-small"
            d="M18 -5 C21 -5 24 -4 27 -5"
          />
          <path
            class="leaf-vein leaf-vein-small"
            d="M23 -7 C25 -9 27 -10 28 -12"
          />
        </g>
      </g>
    `);
  });

  renderRootPngs();

  const target = Number(state.tree?.targetLeaves || 20);
  const complete = leaves.length >= target;

  $("#treeStatus").textContent = complete
    ? "Die Krone ist vollständig gewachsen. Dieser Baum darf in den Lernwald ziehen."
    : "Der Baum wächst still mit euren Lernaufgaben und Herzmomenten.";

  $("#finishTreeBtn")?.classList.toggle("hidden", !complete);
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

if ($("#addRootBtn")) {
  $("#addRootBtn").onclick = async () => {
    const reason = $("#heartReason")?.value.trim() || "";

    if (!selectedHearts.length) {
      alert("Wählt mindestens einen Herzmoment aus.");
      return;
    }

    pendingRootGrowth = true;

    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(spaceRef);
        const roots = [...(snap.data().roots || [])];

        roots.push({
          id: crypto.randomUUID(),
          kinds: [...selectedHearts],
          author: $("#heartAuthor")?.value || "Gemeinsam",
          reason,
          createdAt: new Date().toISOString()
        });

        tx.update(spaceRef, {
          roots,
          updatedAt: serverTimestamp()
        });
      });

      selectedHearts = [];
      if ($("#heartReason")) $("#heartReason").value = "";
      renderHearts();
    } catch (err) {
      pendingRootGrowth = false;
      alert("Die Wurzel konnte nicht gespeichert werden: " + err.message);
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
      .map(k => heartOptions.find(x => x.key === k)?.title || k)
      .join(", ");

    box.insertAdjacentHTML("beforeend", `
      <div class="memory-card">
        <strong>🌱 ${escapeHtml(root.author || "Gemeinsam")}: ${escapeHtml(labels)}</strong>
        ${root.reason ? `<div>${escapeHtml(root.reason)}</div>` : ""}
        <small>${new Date(root.createdAt).toLocaleDateString("de-AT")}</small>
      </div>
    `);
  });
}

function ensureAdminRootsPanel() {
  const panel = $("#mamaPanel");
  if (!panel || $("#adminRootsPanel")) return;

  const section = document.createElement("section");
  section.id = "adminRootsPanel";
  section.innerHTML = `
    <hr>
    <h3>🌱 Gespeicherte Wurzeln</h3>
    <p class="muted">Hier kannst du versehentlich angelegte Wurzeln löschen.</p>
    <div id="adminRootsList"></div>
  `;

  panel.appendChild(section);
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
      .map(k => heartOptions.find(x => x.key === k)?.title || k)
      .join(", ");

    const row = document.createElement("div");
    row.className = "memory-card";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "flex-start";
    row.style.gap = "12px";

    row.innerHTML = `
      <div>
        <strong>🌱 ${escapeHtml(root.author || "Gemeinsam")}: ${escapeHtml(labels)}</strong>
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

if ($("#finishTreeBtn")) {
  $("#finishTreeBtn").onclick = async () => {
    const target = Number(state.tree?.targetLeaves || 20);
    if ((state.learningLeaves || []).length < target) return;

    const name = state.tree?.name || "Unser Wochenbaum";
    if (!confirm(`Soll „${name}“ in den Lernwald wandern?`)) return;

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
          roots: [...(data.roots || [])]
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
    } catch (err) {
      alert("Der Baum konnte nicht in den Lernwald gesetzt werden: " + err.message);
    }
  };
}

if ($("#openForest")) {
  $("#openForest").onclick = () => $("#forestSection")?.classList.remove("hidden");
}

if ($("#closeForest")) {
  $("#closeForest").onclick = () => $("#forestSection")?.classList.add("hidden");
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
    box.insertAdjacentHTML("beforeend", `
      <article class="forest-tree">
        <div class="tree-emoji">🌳</div>
        <strong>${escapeHtml(tree.name)}</strong>
        <div class="muted">
          ${new Date(tree.completedAt).toLocaleDateString("de-AT", {
            month: "long", year: "numeric"
          })}
        </div>
        <small>${tree.roots?.length || 0} Wurzeln begleiten diesen Baum.</small>
      </article>
    `);
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

      ensureAdminRootsPanel();
      prepareAdmin();
      renderAdminRoots();
    } catch {
      $("#mamaUnlockMessage").textContent = "E-Mail-Adresse oder Passwort stimmt nicht.";
    }
  };
}

function prepareAdmin() {
  adminDraft = {
    fina: ensureMinimumTaskSlots(state.tasks || [], "fina"),
    lou: ensureMinimumTaskSlots(state.tasks || [], "lou")
  };

  if ($("#treeNameInput")) $("#treeNameInput").value = state.tree?.name || "";
  if ($("#treeTargetInput")) {
    $("#treeTargetInput").value = String(state.tree?.targetLeaves || 20);
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
  renderAdminRoots();
  renderTaskArchive();
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

function renderTaskArchive() {
  const box = $("#taskArchiveList");
  if (!box) return;

  const archive = [...(state.taskArchive || [])]
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  if (!archive.length) {
    box.innerHTML = `
      <p class="muted">
        Noch keine archivierten Aufgaben.
      </p>
    `;
    return;
  }

  box.innerHTML = archive.map(entry => {
    const childName =
      entry.child === "fina" ? "🌸 Fina" :
      entry.child === "lou" ? "🌺 Lou" :
      entry.child || "";

    const minutes = Math.floor(Number(entry.attentionSeconds || 0) / 60);

    const date = entry.completedAt
      ? new Date(entry.completedAt).toLocaleDateString("de-AT")
      : "";

    const difficultyInfo =
      entry.difficulty === "easy"
        ? { icon: "🍃", label: "Leicht" }
        : entry.difficulty === "medium"
          ? { icon: "🌿", label: "Mittel" }
          : entry.difficulty === "tricky"
            ? { icon: "⭐", label: "Knifflig" }
            : null;

    const difficultyColor = entry.difficulty
      ? getLeafColor(entry.child === "lou" ? "lou" : "fina", entry.difficulty)
      : "";

    return `
      <div class="archive-task">
        <div class="archive-task-meta">
          ${escapeHtml(childName)}
          ${date ? ` · ${escapeHtml(date)}` : ""}
        </div>

        <strong>${escapeHtml(entry.title || "Aufgabe")}</strong>

        ${entry.note
          ? `<div>${escapeHtml(entry.note)}</div>`
          : ""
        }

       <div class="archive-task-details">
         <div class="archive-task-time">
           💛 ${minutes} Min.
         </div>

         ${difficultyInfo
           ? `<div class="archive-difficulty">
                <span
                  class="archive-difficulty-dot"
                  style="background:${escapeHtml(difficultyColor)}"
                ></span>
                ${difficultyInfo.icon} ${difficultyInfo.label}
              </div>`
           : `<div class="archive-difficulty archive-difficulty-old">
                Schwierigkeit nicht erfasst
              </div>`
         }
       </div>

<button
  type="button"
  class="reuse-archive-task"
  data-archive-id="${escapeHtml(entry.id)}"
>
  ↻ Wiederverwenden
</button>
      </div>
    `;
  }).join("");

  box.querySelectorAll(".reuse-archive-task").forEach(btn => {
    btn.onclick = () => {
      const entry = (state.taskArchive || []).find(
        item => item.id === btn.dataset.archiveId
      );

      if (!entry) return;

      const child = entry.child === "lou" ? "lou" : "fina";

     adminDraft[child].unshift({
  id: crypto.randomUUID(),
  child,
  title: entry.title || "",
  note: entry.note || "",
  type: entry.type || "paper",
  url: entry.url || "",
  done: false,
  attentionSeconds: 0,
  activeSince: null
});
     renderAdminTasks(child);
alert("✓ Aufgabe wurde zu „Heute planen“ hinzugefügt.");
    };
  });
}

$$("[data-add-task]").forEach(btn => {
  btn.onclick = () => {
    const child = btn.dataset.addTask;

    adminDraft[child].push({
      id: crypto.randomUUID(),
      child,
      title: "",
      note: "",
      type: "paper",
      url: "",
      done: false,
      attentionSeconds: 0,
      activeSince: null
    });

    renderAdminTasks(child);
  };
});

if ($("#saveTasksBtn")) {
  $("#saveTasksBtn").onclick = async () => {
    const finaTasks = ensureMinimumTaskSlots(adminDraft.fina, "fina")
      .map(task => ({ ...task, activeSince: null }));

    const louTasks = ensureMinimumTaskSlots(adminDraft.lou, "lou")
      .map(task => ({ ...task, activeSince: null }));

    const tasks = [...finaTasks, ...louTasks];

    try {
      await updateDoc(spaceRef, {
        tasks,
        updatedAt: serverTimestamp()
      });
      alert("Die Aufgaben sind jetzt auf allen Geräten veröffentlicht.");
      $("#mamaDialog")?.close();
    } catch (err) {
      alert("Speichern nicht möglich: " + err.message);
    }
  };
}

if ($("#startNextDayBtn")) {
  $("#startNextDayBtn").onclick = async () => {
    const ok = confirm(
      "Möchtest du den Lerntag wirklich abschließen?\n\n" +
      "Erledigte Aufgaben werden aus dem heutigen Plan entfernt.\n" +
      "Unerledigte Aufgaben bleiben erhalten.\n" +
      "Laufende Aufmerksamkeit wird gestoppt.\n" +
      "Der Baum, seine Blätter und Wurzeln bleiben bestehen."
    );

    if (!ok) return;

    try {
      await closeLearningDay();
      $("#mamaDialog")?.close();
      if (!$("#dayClosingDialog")?.open) {
        $("#dayClosingDialog")?.showModal();
      }
    } catch (err) {
      alert("Der Lerntag konnte nicht abgeschlossen werden: " + err.message);
    }
  };
}

if ($("#reopenLearningDayBtn")) {
  $("#reopenLearningDayBtn").onclick = async () => {
    const ok = confirm(
      "Möchtest du den abgeschlossenen Lerntag wieder öffnen?\n\n" +
      "Die Aufgaben werden auf den Stand vor dem Abschluss zurückgesetzt."
    );

    if (!ok) return;

    try {
      await reopenLearningDay();
      $("#mamaDialog")?.close();
    } catch (err) {
      alert("Der Lerntag konnte nicht wieder geöffnet werden: " + err.message);
    }
  };
}

if ($("#beginNewLearningDayBtn")) {
  $("#beginNewLearningDayBtn").onclick = async () => {
    const ok = confirm(
      "Möchtest du jetzt wirklich einen neuen Lerntag starten?\n\n" +
      "Unerledigte Aufgaben bleiben erhalten und ein neuer Tagesimpuls wird gewählt."
    );

    if (!ok) return;

    try {
      await beginNewLearningDay();
      $("#mamaDialog")?.close();
    } catch (err) {
      alert("Der neue Lerntag konnte nicht gestartet werden: " + err.message);
    }
  };
}


if ($("#saveTreeSettings")) {
  $("#saveTreeSettings").onclick = async () => {
    try {
      await updateDoc(spaceRef, {
        tree: {
          ...state.tree,
          name: $("#treeNameInput").value.trim() || "Unser Wochenbaum",
          targetLeaves: Number($("#treeTargetInput").value),
          leafColors: {
            fina: {
              easy: $("#finaEasyColor")?.value || DEFAULT_LEAF_COLORS.fina.easy,
              medium: $("#finaMediumColor")?.value || DEFAULT_LEAF_COLORS.fina.medium,
              tricky: $("#finaTrickyColor")?.value || DEFAULT_LEAF_COLORS.fina.tricky
            },
            lou: {
              easy: $("#louEasyColor")?.value || DEFAULT_LEAF_COLORS.lou.easy,
              medium: $("#louMediumColor")?.value || DEFAULT_LEAF_COLORS.lou.medium,
              tricky: $("#louTrickyColor")?.value || DEFAULT_LEAF_COLORS.lou.tricky
            }
          }
        },
        updatedAt: serverTimestamp()
      });

      alert("Die Baum-Einstellungen wurden gespeichert.");
    } catch (err) {
      alert("Speichern nicht möglich: " + err.message);
    }
  };
}

$$(".tab").forEach(tab => {
  tab.onclick = () => {
    $$(".tab").forEach(x => x.classList.toggle("active", x === tab));
    $$(".tab-panel").forEach(p => p.classList.add("hidden"));
    $("#" + tab.dataset.tab)?.classList.remove("hidden");
  };
});
