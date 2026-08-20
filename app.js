import {
  auth, db, spaceRef, defaultState,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ensureSpace, onSnapshot, updateDoc, runTransaction, serverTimestamp
} from "./firebase.js";

const APP_VERSION = "2.3b Baumwachstum";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let state = structuredClone(defaultState);
let unsubscribe = null;
let selectedHearts = [];
let adminDraft = { fina: [], lou: [] };
let attentionTicker = null;
let pendingTreeGrowth = false;
let treeGrowthTimer = null;

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
  [121,198,-28,1],[139,216,150,-1],[157,220,-22,1],[174,239,155,-1],
  [194,241,-18,1],[214,259,160,-1],[235,265,-15,1],[250,281,165,-1],
  [432,174,28,1],[413,195,208,-1],[393,201,22,1],[373,221,202,-1],
  [351,228,18,1],[331,246,198,-1],[309,254,15,1],[292,270,195,-1],
  [166,126,-22,1],[178,147,158,-1],[190,153,-18,1],[203,173,162,-1],
  [219,181,-15,1],[233,202,165,-1],[249,211,-12,1],[262,230,168,-1]
];

const rootPaths = [
  "M258 385 C230 397 204 415 172 433",
  "M267 389 C246 410 229 432 213 458",
  "M279 389 C276 414 274 439 275 469",
  "M291 389 C309 412 327 436 349 459",
  "M302 384 C331 397 360 416 392 433",
  "M245 390 C216 399 187 402 153 400",
  "M314 391 C345 400 374 402 410 397",
  "M253 395 C229 421 202 444 176 463",
  "M306 395 C332 420 360 444 389 462",
  "M270 396 C260 424 255 449 252 477",
  "M291 396 C301 423 306 449 309 477",
  "M235 392 C205 407 177 417 143 425"
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

function showSunbeam() {
  const section = $(".tree-section");
  if (!section) return;

  let beam = $("#sunbeamEffect");
  if (!beam) {
    beam = document.createElement("div");
    beam.id = "sunbeamEffect";
    beam.setAttribute("aria-hidden", "true");
    beam.innerHTML = '<div class="sunbeam-ray"></div><div class="sunbeam-glow">☀️</div>';
    section.appendChild(beam);
  }

  beam.classList.remove("shine");
  void beam.offsetWidth;
  beam.classList.add("shine");

  setTimeout(() => beam.classList.remove("shine"), 1400);
}

function showTreeGrowthCelebration() {
  const dialog = $("#treeGrowthDialog");
  const preview = $("#treeGrowthPreview");
  const tree = $("#treeSvg");

  if (!dialog || !preview || !tree) return;

  if (treeGrowthTimer) {
    clearTimeout(treeGrowthTimer);
    treeGrowthTimer = null;
  }

  const treeClone = tree.cloneNode(true);
  treeClone.removeAttribute("id");
  treeClone.classList.add("tree-growth-svg");

  const newestLeaf = treeClone.querySelector(".dynamic-leaf:last-of-type");
  newestLeaf?.classList.add("new-growth-leaf");

  preview.replaceChildren(treeClone);

  if (!dialog.open) dialog.showModal();

  treeGrowthTimer = setTimeout(() => {
    if (dialog.open) dialog.close();
    treeGrowthTimer = null;
  }, 3600);
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

async function toggleTask(taskId) {
  let completedNow = false;

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      const data = snap.data();
      const tasks = [...(data.tasks || [])];
      const leaves = [...(data.learningLeaves || [])];
      const index = tasks.findIndex(t => t.id === taskId);
      const archive = [...(data.taskArchive || [])];

      if (index < 0) return;

      const task = { ...tasks[index] };
      const willBeDone = !task.done;

      if (willBeDone && task.activeSince) {
        const started = new Date(task.activeSince).getTime();
        const elapsed = Number.isFinite(started)
          ? Math.max(0, Math.floor((Date.now() - started) / 1000))
          : 0;

        task.attentionSeconds =
          Number(task.attentionSeconds || 0) +
          Math.min(elapsed, MAX_SESSION_SECONDS);

        task.activeSince = null;
      }

      task.done = willBeDone;
      tasks[index] = task;
if (task.done) {
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
      completedAt: new Date().toISOString()
    });
  }
}
      const leafIndex = leaves.findIndex(l => l.taskId === taskId);

      if (task.done && leafIndex < 0) {
        leaves.push({
          id: crypto.randomUUID(),
          taskId,
          child: task.child,
          title: task.title,
          attentionSeconds: Number(task.attentionSeconds || 0),
          createdAt: new Date().toISOString()
        });
        completedNow = true;
      }

      if (!task.done && leafIndex >= 0) {
        leaves.splice(leafIndex, 1);
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

function renderTree() {
  const leafLayer = $("#leafLayer");
  const flowerLayer = $("#flowerLayer");
  const rootLayer = $("#rootLayer");
  if (!leafLayer || !flowerLayer || !rootLayer) return;

  leafLayer.innerHTML = "";
  flowerLayer.innerHTML = "";
  rootLayer.innerHTML = "";

  const leaves = (state.learningLeaves || []).slice(0, leafPositions.length);

  leaves.forEach((leaf, i) => {
    const [x, y, rot, mirror] = leafPositions[i];
    const color = i % 2 === 0 ? "#9fb58f" : "#86b7c9";

    leafLayer.insertAdjacentHTML("beforeend", `
      <g transform="translate(${x} ${y}) rotate(${rot}) scale(1 ${mirror})"
         class="dynamic-leaf">
        <path d="M0 0 C8 -16 25 -18 35 -4 C25 10 10 12 0 0Z"
          fill="${color}" stroke="#765f52" stroke-width="1.2"/>
        <path d="M3 0 C14 -1 24 -2 32 -4"
          fill="none" stroke="#fffaf4" stroke-width="1.15"/>
      </g>
    `);
  });

  const branchEnds = [[112,194],[438,169],[157,119],[390,108],[231,60],[340,45]];
  const target = Number(state.tree?.targetLeaves || 20);
  const perBranch = Math.max(2, Math.ceil(target / 6));

  branchEnds.forEach((p, b) => {
    if (leaves.length >= Math.min(target, (b + 1) * perBranch)) {
      flowerLayer.insertAdjacentHTML("beforeend", flowerSvg(p[0], p[1], b));
    }
  });

  (state.roots || []).slice(0, rootPaths.length).forEach((root, i) => {
    rootLayer.insertAdjacentHTML(
      "beforeend",
      `<path d="${rootPaths[i]}" class="dynamic-root"
        stroke-width="${Math.max(4, 8 - i * .25)}"/>`
    );
  });

  const complete = leaves.length >= target;
  $("#treeStatus").textContent = complete
    ? "Die Krone ist vollständig gewachsen. Dieser Baum darf in den Lernwald ziehen."
    : "Der Baum wächst still mit euren Lernaufgaben und Herzmomenten.";

  $("#finishTreeBtn")?.classList.toggle("hidden", !complete);
}

function flowerSvg(x, y, i) {
  const colors = ["#efb6ad","#c6afe0","#f1cc76","#b8cda9","#e8a76f","#9ec6d4"];
  const c = colors[i % colors.length];

  return `<g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="-11" rx="7" ry="11" fill="${c}"/>
    <ellipse cx="10" cy="-3" rx="7" ry="11" fill="${c}" transform="rotate(55 10 -3)"/>
    <ellipse cx="6" cy="9" rx="7" ry="11" fill="${c}" transform="rotate(115 6 9)"/>
    <ellipse cx="-6" cy="9" rx="7" ry="11" fill="${c}" transform="rotate(-115 -6 9)"/>
    <ellipse cx="-10" cy="-3" rx="7" ry="11" fill="${c}" transform="rotate(-55 -10 -3)"/>
    <circle r="6" fill="#e6bd62"/>
  </g>`;
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

       <div class="archive-task-time">
  💛 ${minutes} Min.
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
          targetLeaves: Number($("#treeTargetInput").value)
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
