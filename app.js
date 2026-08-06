import {
  auth, db, spaceRef, defaultState,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  ensureSpace, onSnapshot, updateDoc, runTransaction, serverTimestamp
} from "./firebase.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let state = structuredClone(defaultState);
let unsubscribe = null;
let selectedHearts = [];
let adminDraft = { fina: [], lou: [] };

const quotes = [
  "Die Welt steckt voller kleiner Wunder – schaut, welches ihr heute entdeckt.",
  "Neugier ist ein wunderbarer Anfang.",
  "Jeder kleine Schritt zählt.",
  "Heute darf etwas Neues wachsen.",
  "Nimm ein Lächeln mit in deinen Tag. Es passt überall hin."
];

const heartOptions = [
  { key: "help", icon: "💗", title: "Hilfsbereitschaft", text: "Jemandem geholfen" },
  { key: "comfort", icon: "🌸", title: "Mitgefühl", text: "Jemanden getröstet" },
  { key: "courage", icon: "⭐", title: "Mut", text: "Etwas gewagt" },
  { key: "persist", icon: "🌱", title: "Dranbleiben", text: "Nicht aufgegeben" },
  { key: "beauty", icon: "☀️", title: "Schöner Moment", text: "Etwas Schönes entdeckt" },
  { key: "curious", icon: "🦋", title: "Neugier", text: "Etwas wissen wollen" },
  { key: "kindness", icon: "🤝", title: "Freundlichkeit", text: "Freundlichkeit erlebt" },
  { key: "consideration", icon: "🌈", title: "Rücksicht", text: "Auf jemanden Rücksicht genommen" }
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

onAuthStateChanged(auth, async user => {
  if (user) {
    $("#loginView")?.classList.add("hidden");
    $("#appView")?.classList.remove("hidden");

    await ensureSpace();

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

function renderAll() {
  const now = new Date();
  $("#todayLabel").textContent = now.toLocaleDateString("de-AT", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
  $("#dailyQuote").textContent = quotes[now.getDate() % quotes.length];
  $("#treeTitle").textContent = state.tree?.name || "Unser Wochenbaum";

  renderTasks("fina");
  renderTasks("lou");
  renderTree();
  renderHearts();
  renderRootMemories();
  renderForest();
  renderAdminRoots();
}

function renderTasks(child) {
  const box = $("#" + child + "Tasks");
  if (!box) return;

  const tasks = (state.tasks || []).filter(t => t.child === child);
  box.innerHTML = "";

  if (!tasks.length) {
    box.innerHTML = '<div class="empty">Heute wartet hier nichts auf dich.</div>';
    return;
  }

  tasks.forEach(task => {
    const row = document.createElement("div");
    row.className = "task";
    row.innerHTML = `
      <button class="leaf-toggle ${task.done ? "done" : ""}"
        aria-label="Aufgabe ${task.done ? "wieder öffnen" : "abschließen"}">
        ${leafSvg()}
      </button>
      <div class="task-main">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-note">${escapeHtml(task.note || "")}</div>
      </div>
      ${task.type === "online" && task.url
        ? `<a class="task-link" href="${escapeHtml(task.url)}"
             target="_blank" rel="noopener">Öffnen ↗</a>`
        : ""}
    `;

    row.querySelector(".leaf-toggle").onclick = () => toggleTask(task.id);
    box.appendChild(row);
  });
}

async function toggleTask(taskId) {
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(spaceRef);
      const data = snap.data();
      const tasks = [...(data.tasks || [])];
      const leaves = [...(data.learningLeaves || [])];
      const index = tasks.findIndex(t => t.id === taskId);

      if (index < 0) return;

      const task = { ...tasks[index] };
      task.done = !task.done;
      tasks[index] = task;

      const leafIndex = leaves.findIndex(l => l.taskId === taskId);

      if (task.done && leafIndex < 0) {
        leaves.push({
          id: crypto.randomUUID(),
          taskId,
          child: task.child,
          title: task.title,
          createdAt: new Date().toISOString()
        });
      }

      if (!task.done && leafIndex >= 0) {
        leaves.splice(leafIndex, 1);
      }

      tx.update(spaceRef, {
        tasks,
        learningLeaves: leaves,
        updatedAt: serverTimestamp()
      });
    });
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
  const author = $("#heartAuthor");
  const noteField = $("#heartNoteField");

  if (!author || !noteField) return;

  const show = author.value === "Baumpfleger";
  noteField.classList.toggle("hidden", !show);

  if (!show && $("#heartReason")) {
    $("#heartReason").value = "";
  }
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
if ($("#openMama")) {
  $("#openMama").onclick = () => {
    $("#mamaUnlock")?.classList.remove("hidden");
    $("#mamaPanel")?.classList.add("hidden");

    if ($("#mamaEmail") && auth.currentUser?.email) {
      $("#mamaEmail").value = auth.currentUser.email;
    }

    if ($("#mamaPassword")) $("#mamaPassword").value = "";
    if ($("#mamaUnlockMessage")) $("#mamaUnlockMessage").textContent = "";

    $("#mamaDialog")?.showModal();
  };
}

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
    fina: (state.tasks || []).filter(t => t.child === "fina").map(t => ({ ...t })),
    lou: (state.tasks || []).filter(t => t.child === "lou").map(t => ({ ...t }))
  };

  if ($("#treeNameInput")) $("#treeNameInput").value = state.tree?.name || "";
  if ($("#treeTargetInput")) {
    $("#treeTargetInput").value = String(state.tree?.targetLeaves || 20);
  }

  renderAdminTasks("fina");
  renderAdminTasks("lou");
  renderAdminRoots();
}

function renderAdminTasks(child) {
  const box = $("#admin" + (child === "fina" ? "Fina" : "Lou") + "Tasks");
  if (!box) return;

  box.innerHTML = "";

  adminDraft[child].forEach((task, index) => {
    const row = document.createElement("div");
    row.className = "admin-task";

    row.innerHTML = `
      <input data-field="title" value="${escapeHtml(task.title)}" placeholder="Aufgabe">
      <select data-field="type">
        <option value="paper" ${task.type === "paper" ? "selected" : ""}>Papier</option>
        <option value="online" ${task.type === "online" ? "selected" : ""}>Lernhomepage</option>
      </select>
      <button type="button" class="remove-task">✕</button>
      <input class="full" data-field="note" value="${escapeHtml(task.note || "")}"
        placeholder="Kurze Anweisung">
      <input class="full" data-field="url" value="${escapeHtml(task.url || "")}"
        placeholder="Link – nur bei Lernhomepage">
    `;

    row.querySelectorAll("[data-field]").forEach(el => {
      el.oninput = () => {
        adminDraft[child][index][el.dataset.field] = el.value;
      };
    });

    row.querySelector(".remove-task").onclick = () => {
      adminDraft[child].splice(index, 1);
      renderAdminTasks(child);
    };

    box.appendChild(row);
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
      done: false
    });

    renderAdminTasks(child);
  };
});

if ($("#saveTasksBtn")) {
  $("#saveTasksBtn").onclick = async () => {
    const tasks = [...adminDraft.fina, ...adminDraft.lou]
      .filter(t => t.title.trim());

    try {
      await updateDoc(spaceRef, {
        tasks,
        updatedAt: serverTimestamp()
      });
      alert("Die Aufgaben sind jetzt auf allen Geräten veröffentlicht.");
    } catch (err) {
      alert("Speichern nicht möglich: " + err.message);
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
