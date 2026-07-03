const DESIGNS = {
  emjfl: {
    name: "EMJFL Orange",
    short: "EMJFL",
    desc: "Official grassroots football frame",
    grad: "#f06a11",
    panel: "transparent",
    accent: "#f03717",
    template: "emjfl",
    baseImage: "public/templates/emjfl-orange/base.png",
    overlayImage: "public/templates/emjfl-orange/footer-swoosh.png",
    defaultPlayer: "public/templates/emjfl-orange/default-player-clean.png",
  },
  orange: {
    name: "Club Orange",
    short: "Orange",
    desc: "Gloss orange, Emblem signature",
    grad: "linear-gradient(160deg,#ff8a3c,#c33b0a)",
    panel: "#191009",
    accent: "#f1874f",
  },
  green: {
    name: "Heritage Green",
    short: "Green",
    desc: "Deep pitch green foil",
    grad: "linear-gradient(160deg,#2fa05c,#0b3d24)",
    panel: "#07190f",
    accent: "#8fd1ae",
  },
  black: {
    name: "Matchday Black",
    short: "Black",
    desc: "Charcoal with silver edge",
    grad: "linear-gradient(160deg,#585e66,#101317)",
    panel: "#0b0d0f",
    accent: "#c7ccd2",
  },
};

const SPORTS = {
  football: {
    label: "Football",
    positions: ["Goalkeeper", "Defender", "Wing-back", "Midfielder", "Winger", "Forward", "Striker"],
    stats: [
      { key: "statA", label: "Appearances", placeholder: "18" },
      { key: "statB", label: "Goals", placeholder: "12" },
      { key: "statC", label: "Assists", placeholder: "7" },
    ],
  },
  rugby: {
    label: "Rugby",
    positions: ["Prop", "Hooker", "Lock", "Flanker", "Number 8", "Scrum-half", "Fly-half", "Centre", "Wing", "Full-back"],
    stats: [
      { key: "statA", label: "Appearances", placeholder: "14" },
      { key: "statB", label: "Tries", placeholder: "6" },
      { key: "statC", label: "Tackles", placeholder: "41" },
    ],
  },
};

const STORE_KEY = "emblem-session-v5";

const state = {
  players: [],
  mode: window.location.hash === "#team" ? "team" : "single",
  view: "build",
  design: "emjfl",
  editingId: null,
  photoTargetId: null,
};

let uid = 100;

const el = {
  sessionTitle: document.querySelector("#sessionTitle"),
  viewTabs: document.querySelector("#viewTabs"),
  singleView: document.querySelector("#singleView"),
  teamBuildView: document.querySelector("#teamBuildView"),
  reviewView: document.querySelector("#reviewView"),
  singleCardPreview: document.querySelector("#singleCardPreview"),
  singlePickPhoto: document.querySelector("#singlePickPhoto"),
  singleStatus: document.querySelector("#singleStatus"),
  singlePrints: document.querySelector("#singlePrints"),
  singleFields: document.querySelector("[data-single-fields]"),
  singleStats: document.querySelector("[data-single-stats]"),
  singleDesigns: document.querySelector("[data-single-designs]"),
  addAndGoTeam: document.querySelector("#addAndGoTeam"),
  designList: document.querySelector("#designList"),
  applyDesignToAll: document.querySelector("#applyDesignToAll"),
  bulkUpload: document.querySelector("#bulkUpload"),
  addPlayer: document.querySelector("#addPlayer"),
  rosterSummary: document.querySelector("#rosterSummary"),
  playerList: document.querySelector("#playerList"),
  approveAllReady: document.querySelector("#approveAllReady"),
  reviewGrid: document.querySelector("#reviewGrid"),
  drawerShell: document.querySelector("#drawerShell"),
  drawerTitle: document.querySelector("#drawerTitle"),
  drawerThumb: document.querySelector("#drawerThumb"),
  drawerPickPhoto: document.querySelector("#drawerPickPhoto"),
  drawerFields: document.querySelector("#drawerFields"),
  drawerStats: document.querySelector("#drawerStats"),
  drawerDesigns: document.querySelector("#drawerDesigns"),
  closeDrawer: document.querySelector("#closeDrawer"),
  closeDrawerBackdrop: document.querySelector("#closeDrawerBackdrop"),
  doneDrawer: document.querySelector("#doneDrawer"),
  duplicatePlayer: document.querySelector("#duplicatePlayer"),
  removePlayer: document.querySelector("#removePlayer"),
  totalPlayers: document.querySelector("#totalPlayers"),
  playersWord: document.querySelector("#playersWord"),
  readyCount: document.querySelector("#readyCount"),
  approvedCount: document.querySelector("#approvedCount"),
  totalPrints: document.querySelector("#totalPrints"),
  tierLabel: document.querySelector("#tierLabel"),
  totalPrice: document.querySelector("#totalPrice"),
  exportOrder: document.querySelector("#exportOrder"),
  primaryAction: document.querySelector("#primaryAction"),
  singlePhotoInput: document.querySelector("#singlePhotoInput"),
};

function blank(seed) {
  return {
    id: uid++,
    name: "",
    club: seed?.club || "",
    ageGroup: seed?.ageGroup || "",
    sport: seed?.sport || "football",
    position: "",
    shirt: "",
    statA: "",
    statB: "",
    statC: "",
    photo: null,
    design: state.design,
    prints: 1,
    approved: false,
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && Array.isArray(saved.players)) {
      state.players = saved.players;
      state.players = state.players.map(normalisePlayer);
      state.mode = window.location.hash === "#team" ? "team" : saved.mode || state.mode;
      state.design = saved.design || state.design;
      uid = Math.max(100, ...state.players.map((player) => Number(player.id) + 1));
    }
  } catch {
    state.players = [];
  }

  if (!state.players.length) state.players = state.mode === "team" ? [] : [blank(null)];
}

function normalisePlayer(player) {
  const sport = String(player.sport || "football").toLowerCase();
  return {
    ...player,
    sport: SPORTS[sport] ? sport : sport === "soccer" ? "football" : "football",
    prints: Math.max(1, Number(player.prints || 1)),
    approved: Boolean(player.approved),
  };
}

function save() {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ players: state.players, mode: state.mode, design: state.design })
  );
}

function status(player) {
  if (!player.photo) return "needs-photo";
  if (!(player.name && player.position && String(player.shirt).trim() !== "")) return "needs-details";
  return player.approved ? "approved" : "ready";
}

function statusLabel(value) {
  return {
    "needs-photo": "Needs photo",
    "needs-details": "Needs details",
    ready: "Ready to approve",
    approved: "Approved",
  }[value];
}

function priceTier(count) {
  if (count >= 10) return { per: 15, label: "Team pack - \u00a315 per card" };
  if (count >= 2) return { per: 20, label: "Set pricing - \u00a320 per card" };
  return { per: 24, label: "Single card - \u00a324" };
}

function counts() {
  const result = { "needs-photo": 0, "needs-details": 0, ready: 0, approved: 0 };
  state.players.forEach((player) => {
    result[status(player)] += 1;
  });
  return result;
}

function playerMeta(player) {
  const sport = SPORTS[player.sport]?.label || "Football";
  const bits = [sport, player.ageGroup, player.position, player.shirt ? `No. ${player.shirt}` : ""].filter(Boolean);
  return `${player.club ? `${player.club} - ` : ""}${bits.join(" - ") || "Add details"}`;
}

function cardLine(player) {
  return [player.club, player.position].filter(Boolean).join(" - ") || "Add details";
}

function designFor(player) {
  return DESIGNS[player.design] || DESIGNS.orange;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setPlayer(id, patch) {
  state.players = state.players.map((player) => {
    if (player.id !== id) return player;
    const next = { ...player, ...patch };
    if ("sport" in patch) {
      next.position = "";
      next.statA = "";
      next.statB = "";
      next.statC = "";
    }
    if (!("prints" in patch) && !("approved" in patch)) next.approved = false;
    return next;
  });
  save();
  render();
}

function makeSelect(player, key, label, options, className = "") {
  return `
    <label class="field ${className}">
      ${label}
      <select data-field="${key}" data-player="${player.id}">
        ${options
          .map((option) => {
            const value = typeof option === "string" ? option : option.value;
            const text = typeof option === "string" ? option : option.label;
            return `<option value="${escapeHtml(value)}" ${player[key] === value ? "selected" : ""}>${escapeHtml(text)}</option>`;
          })
          .join("")}
      </select>
    </label>
  `;
}

function makeField(player, key, label, placeholder, className = "") {
  return `
    <label class="field ${className}">
      ${label}
      <input data-field="${key}" data-player="${player.id}" value="${escapeHtml(player[key])}" placeholder="${placeholder}">
    </label>
  `;
}

function makeStats(player) {
  const sport = SPORTS[player.sport] || SPORTS.football;
  return sport.stats
    .map((stat) => makeField(player, stat.key, stat.label, stat.placeholder, ""))
    .join("");
}

function makeFields(player) {
  const sport = SPORTS[player.sport] || SPORTS.football;
  return `
    ${makeField(player, "name", "Player name", "e.g. Jacob Thompson", "full")}
    ${makeField(player, "club", "Team / club", "e.g. AFC Oldham", "full")}
    ${makeSelect(player, "sport", "Sport", Object.entries(SPORTS).map(([value, config]) => ({ value, label: config.label })))}
    ${makeField(player, "ageGroup", "Age group", "e.g. U12")}
    ${makeSelect(player, "position", "Position", ["", ...sport.positions])}
    ${makeField(player, "shirt", "Shirt number", "e.g. 10")}
  `;
}

function bindFields(scope) {
  scope.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("change", () => {
      setPlayer(Number(input.dataset.player), { [input.dataset.field]: input.value });
    });
  });
}

function makeDesignChips(player) {
  return Object.entries(DESIGNS)
    .map(([key, design]) => {
      const active = player.design === key ? "active" : "";
      return `
        <button class="design-chip ${active}" type="button" data-player-design="${key}" data-player="${player.id}">
          <span class="design-swatch" style="background:${design.grad}"></span>
          <span>${design.short}</span>
        </button>
      `;
    })
    .join("");
}

function bindDesignChips(scope) {
  scope.querySelectorAll("[data-player-design]").forEach((button) => {
    button.addEventListener("click", () => {
      setPlayer(Number(button.dataset.player), { design: button.dataset.playerDesign });
    });
  });
}

function renderCard(container, player) {
  const design = designFor(player);
  container.classList.toggle("real-template", design.template === "emjfl");
  container.style.background = design.grad;
  container.style.backgroundImage = "";
  container.style.backgroundPosition = "";
  container.style.backgroundRepeat = "";
  container.style.backgroundSize = "";
  if (design.template === "emjfl") {
    container.style.setProperty("--template-overlay", `url("${design.overlayImage}")`);
    container.style.backgroundImage = `url("${design.baseImage}")`;
    container.style.backgroundPosition = "center";
    container.style.backgroundRepeat = "no-repeat";
    container.style.backgroundSize = "cover";
  }
  const photo = container.querySelector(".card-photo");
  const previewPhoto = player.photo || (design.template === "emjfl" ? design.defaultPlayer : "");
  photo.style.backgroundImage = previewPhoto ? `url("${previewPhoto}")` : "";
  photo.querySelector("span").style.display = previewPhoto ? "none" : "block";
  container.querySelector(".card-footer").style.background = design.panel;
  container.querySelector(".card-footer h2").textContent = player.name || "Unnamed player";
  container.querySelector(".card-footer p").textContent = cardLine(player);
  container.querySelector(".card-footer p").style.color = design.accent;
  container.querySelector(".shirt-number").textContent = player.shirt || "";
}

function renderSingle() {
  const player = state.players[0] || blank(null);
  if (!state.players.length) state.players = [player];
  renderCard(el.singleCardPreview, player);
  const st = status(player);
  el.singleStatus.className = `status-pill ${st}`;
  el.singleStatus.textContent = statusLabel(st);
  el.singlePickPhoto.textContent = player.photo ? "Change photo" : "Add photo";
  el.singlePrints.textContent = `${player.prints} ${player.prints === 1 ? "print" : "prints"}`;
  el.singleFields.innerHTML = makeFields(player);
  el.singleStats.innerHTML = makeStats(player);
  el.singleDesigns.innerHTML = makeDesignChips(player);
  bindFields(el.singleView);
  bindDesignChips(el.singleView);
}

function renderDesignList() {
  el.designList.innerHTML = Object.entries(DESIGNS)
    .map(([key, design]) => `
      <button class="design-option ${state.design === key ? "active" : ""}" type="button" data-session-design="${key}">
        <span class="design-swatch" style="background:${design.grad}"></span>
        <span><strong>${design.name}</strong><small>${design.desc}</small></span>
        <em>${state.design === key ? "Selected" : ""}</em>
      </button>
    `)
    .join("");

  el.designList.querySelectorAll("[data-session-design]").forEach((button) => {
    button.addEventListener("click", () => {
      state.design = button.dataset.sessionDesign;
      save();
      render();
    });
  });
}

function renderRoster() {
  const c = counts();
  el.rosterSummary.textContent = `${state.players.length} players - ${c.ready} ready - ${c["needs-photo"]} need a photo - ${c["needs-details"]} need details`;

  if (!state.players.length) {
    el.playerList.innerHTML = `<div class="upload-drop">No players yet. Bulk-upload photos or add a player to start the squad.</div>`;
    return;
  }

  el.playerList.innerHTML = state.players
    .map((player) => {
      const st = status(player);
      return `
        <article class="player-row ${st}">
          <button class="player-thumb" type="button" data-open="${player.id}" style="${player.photo ? `background-image:url('${player.photo}')` : ""}" aria-label="Edit ${escapeHtml(player.name || "player")}"></button>
          <div class="player-info" data-open="${player.id}">
            <strong>${escapeHtml(player.name || "Unnamed player")}</strong>
            <span>${escapeHtml(playerMeta(player))}</span>
          </div>
          <span class="player-status">${statusLabel(st)}</span>
          <div class="stepper">
            <button type="button" data-print="${player.id}" data-delta="-1">-</button>
            <span>${player.prints} prints</span>
            <button type="button" data-print="${player.id}" data-delta="1">+</button>
          </div>
          <button class="edit-row-button" type="button" data-open="${player.id}">Edit</button>
        </article>
      `;
    })
    .join("");

  el.playerList.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openEditor(Number(button.dataset.open)));
  });
  el.playerList.querySelectorAll("[data-print]").forEach((button) => {
    button.addEventListener("click", () => adjustPrints(Number(button.dataset.print), Number(button.dataset.delta)));
  });
}

function reviewCard(player) {
  const st = status(player);
  const design = designFor(player);
  const disabled = st === "needs-photo" || st === "needs-details";
  const isRealTemplate = design.template === "emjfl";
  const previewPhoto = player.photo || (isRealTemplate ? design.defaultPlayer : "");
  const backgroundStyle = isRealTemplate
    ? `--template-overlay:url('${design.overlayImage}');background:${design.grad};background-image:url('${design.baseImage}');background-position:center;background-repeat:no-repeat;background-size:cover;`
    : `background:${design.grad}`;
  return `
    <article class="review-card">
      <div class="builder-card-preview ${isRealTemplate ? "real-template" : ""}" style="${backgroundStyle}">
        <div class="card-photo" style="${previewPhoto ? `background-image:url('${previewPhoto}')` : ""}">
          <span style="display:${previewPhoto ? "none" : "block"}">No photo</span>
        </div>
        <div class="card-footer" style="background:${design.panel}">
          <h2>${escapeHtml(player.name || "Unnamed player")}</h2>
          <p style="color:${design.accent}">${escapeHtml(cardLine(player))}</p>
        </div>
        <strong class="shirt-number">${escapeHtml(player.shirt)}</strong>
      </div>
      <div>
        <h3>${escapeHtml(player.name || "Unnamed player")}</h3>
        <p>${escapeHtml(playerMeta(player))}</p>
      </div>
      <span class="review-status ${st}">${statusLabel(st)}</span>
      <div class="review-actions">
        <button type="button" data-open="${player.id}">Edit</button>
        <button class="approve ${st === "approved" ? "approved" : ""}" type="button" data-approve="${player.id}" ${disabled ? "disabled" : ""}>
          ${st === "approved" ? "Approved" : "Approve"}
        </button>
      </div>
    </article>
  `;
}

function renderReview() {
  const c = counts();
  el.approveAllReady.textContent = c.ready > 0 ? `Approve ${c.ready} ready ${c.ready === 1 ? "card" : "cards"}` : "All ready cards approved";
  el.approveAllReady.disabled = c.ready === 0;
  el.reviewGrid.innerHTML = state.players.map(reviewCard).join("");
  el.reviewGrid.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openEditor(Number(button.dataset.open)));
  });
  el.reviewGrid.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => toggleApprove(Number(button.dataset.approve)));
  });
}

function renderDrawer() {
  const player = state.players.find((item) => item.id === state.editingId);
  el.drawerShell.hidden = !player || state.mode !== "team";
  if (!player) return;

  el.drawerTitle.textContent = player.name || "New player";
  el.drawerThumb.style.backgroundImage = player.photo ? `url("${player.photo}")` : "";
  el.drawerThumb.querySelector("span").style.display = player.photo ? "none" : "block";
  el.drawerPickPhoto.textContent = player.photo ? "Change photo" : "Add photo";
  el.drawerFields.innerHTML = makeFields(player);
  el.drawerStats.innerHTML = makeStats(player);
  el.drawerDesigns.innerHTML = makeDesignChips(player);
  bindFields(el.drawerShell);
  bindDesignChips(el.drawerShell);
}

function renderSummary() {
  const c = counts();
  const totalPrints = state.players.reduce((sum, player) => sum + Number(player.prints || 1), 0);
  const tier = priceTier(state.players.length);
  const singleReady = state.players[0] && !["needs-photo", "needs-details"].includes(status(state.players[0]));

  el.totalPlayers.textContent = state.players.length;
  el.playersWord.textContent = state.players.length === 1 ? "player" : "players";
  el.readyCount.textContent = c.ready;
  el.approvedCount.textContent = c.approved;
  el.totalPrints.textContent = totalPrints;
  el.tierLabel.textContent = tier.label;
  el.totalPrice.textContent = `\u00a3${totalPrints * tier.per}`;
  el.exportOrder.hidden = c.approved === 0;

  if (state.mode === "single") {
    el.primaryAction.textContent = singleReady ? "Export approved order" : "Add photo and details";
  } else if (state.view === "build") {
    el.primaryAction.textContent = "Review and approve";
  } else {
    el.primaryAction.textContent = c.approved > 0 ? "Export approved order" : "Approve cards to continue";
  }
}

function orderManifest() {
  const approvedPlayers = state.players.filter((player) => status(player) === "approved");
  const totalPrints = approvedPlayers.reduce((sum, player) => sum + Number(player.prints || 1), 0);
  const tier = priceTier(state.players.length);
  return {
    source: "emblem-uk-static-builder",
    version: 1,
    createdAt: new Date().toISOString(),
    session: {
      mode: state.mode,
      sportFocus: "uk-football-rugby",
      selectedDesign: state.design,
      approvedCards: approvedPlayers.length,
      totalPrints,
      currency: "GBP",
      estimatedTotal: totalPrints * tier.per,
      pricingLabel: tier.label,
    },
    productionNotes: [
      "Each approved player should become one CardArt render payload.",
      "The photo field is a browser data URL in this prototype; production should upload photos and store stable asset URLs.",
      "Print generation should use the youthcards CardArt plus render-print/PDF pipeline.",
    ],
    players: approvedPlayers.map((player, index) => {
      const sport = SPORTS[player.sport] || SPORTS.football;
      return {
        orderIndex: index + 1,
        playerId: player.id,
        name: player.name,
        club: player.club,
        ageGroup: player.ageGroup,
        sport: player.sport,
        sportLabel: sport.label,
        position: player.position,
        shirtNumber: player.shirt,
        stats: Object.fromEntries(sport.stats.map((stat) => [stat.key, { label: stat.label, value: player[stat.key] || "" }])),
        design: player.design,
        prints: Number(player.prints || 1),
        approved: true,
        photoDataUrl: player.photo,
      };
    }),
  };
}

function exportApprovedOrder() {
  const manifest = orderManifest();
  if (!manifest.players.length) return;
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `emblem-uk-order-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function render() {
  save();
  const isSingle = state.mode === "single";
  const isTeam = state.mode === "team";
  el.sessionTitle.textContent = isSingle ? "Your card" : "Squad card builder";
  el.viewTabs.hidden = !isTeam;
  el.singleView.hidden = !isSingle;
  el.teamBuildView.hidden = !(isTeam && state.view === "build");
  el.reviewView.hidden = !(isTeam && state.view === "review");

  el.viewTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  if (isSingle) renderSingle();
  if (isTeam) {
    renderDesignList();
    renderRoster();
    renderReview();
  }
  renderDrawer();
  renderSummary();
}

function readFiles(files, callback) {
  const list = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  if (!list.length) return;
  let done = 0;
  const urls = [];
  list.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = () => {
      urls[index] = reader.result;
      done += 1;
      if (done === list.length) callback(urls);
    };
    reader.readAsDataURL(file);
  });
}

function addPlayer(open = true) {
  const player = blank(state.players[0]);
  state.players.push(player);
  if (open) state.editingId = player.id;
  save();
  render();
}

function openEditor(id) {
  state.editingId = id;
  render();
}

function closeEditor() {
  state.editingId = null;
  render();
}

function adjustPrints(id, delta) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  setPlayer(id, { prints: Math.max(1, Math.min(20, Number(player.prints || 1) + delta)) });
}

function toggleApprove(id) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  const st = status(player);
  if (st === "needs-photo" || st === "needs-details") return;
  setPlayer(id, { approved: !player.approved });
}

function pickPhotoFor(id) {
  state.photoTargetId = id;
  el.singlePhotoInput.click();
}

function bindEvents() {
  el.viewTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  el.singlePickPhoto.addEventListener("click", () => pickPhotoFor(state.players[0].id));
  document.querySelectorAll("[data-single-print]").forEach((button) => {
    button.addEventListener("click", () => adjustPrints(state.players[0].id, Number(button.dataset.singlePrint)));
  });

  el.addAndGoTeam.addEventListener("click", () => {
    state.mode = "team";
    state.view = "build";
    addPlayer(true);
  });

  el.addPlayer.addEventListener("click", () => addPlayer(true));
  el.applyDesignToAll.addEventListener("click", () => {
    state.players = state.players.map((player) => ({ ...player, design: state.design, approved: false }));
    render();
  });

  el.bulkUpload.addEventListener("change", (event) => {
    readFiles(event.target.files, (urls) => {
      urls.forEach((url) => {
        const empty = state.players.find((player) => !player.photo);
        if (empty) empty.photo = url;
        else state.players.push({ ...blank(state.players[0]), photo: url });
      });
      event.target.value = "";
      render();
    });
  });

  el.singlePhotoInput.addEventListener("change", (event) => {
    readFiles(event.target.files, (urls) => {
      if (state.photoTargetId != null && urls[0]) setPlayer(state.photoTargetId, { photo: urls[0] });
      event.target.value = "";
    });
  });

  el.approveAllReady.addEventListener("click", () => {
    state.players = state.players.map((player) => (status(player) === "ready" ? { ...player, approved: true } : player));
    render();
  });

  el.exportOrder.addEventListener("click", exportApprovedOrder);

  el.drawerPickPhoto.addEventListener("click", () => pickPhotoFor(state.editingId));
  el.closeDrawer.addEventListener("click", closeEditor);
  el.closeDrawerBackdrop.addEventListener("click", closeEditor);
  el.doneDrawer.addEventListener("click", closeEditor);
  el.removePlayer.addEventListener("click", () => {
    state.players = state.players.filter((player) => player.id !== state.editingId);
    state.editingId = null;
    render();
  });
  el.duplicatePlayer.addEventListener("click", () => {
    const index = state.players.findIndex((player) => player.id === state.editingId);
    if (index < 0) return;
    const copy = { ...state.players[index], id: uid++, name: "", approved: false };
    state.players.splice(index + 1, 0, copy);
    state.editingId = copy.id;
    render();
  });

  el.primaryAction.addEventListener("click", () => {
    if (state.mode === "team" && state.view === "build") {
      state.view = "review";
      render();
      return;
    }

    if (state.mode === "single") {
      const player = state.players[0];
      if (player && status(player) === "ready") {
        setPlayer(player.id, { approved: true });
        exportApprovedOrder();
      } else if (player && status(player) === "approved") {
        exportApprovedOrder();
      } else {
        pickPhotoFor(player?.id);
      }
      return;
    }

    if (state.mode === "team" && state.view === "review" && counts().approved > 0) {
      exportApprovedOrder();
    }
  });
}

load();
bindEvents();
render();
