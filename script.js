const players = [
  {
    name: "Jacob Thompson",
    position: "Midfielder",
    status: "Ready",
    photo: "public/hollinwood-card-01.png",
  },
  {
    name: "Amelia Carter",
    position: "Forward",
    status: "Ready",
    photo: "public/hollinwood-card-03.png",
  },
  {
    name: "Noah Williams",
    position: "Goalkeeper",
    status: "Missing photo",
    photo: "",
  },
];

const playerList = document.querySelector("#playerList");
const playerTotal = document.querySelector("#playerTotal");
const readyTotal = document.querySelector("#readyTotal");
const printTotal = document.querySelector("#printTotal");
const printCount = document.querySelector("#printCount");
const addPlayerButton = document.querySelector("#addPlayer");
const approveReadyButton = document.querySelector("#approveReady");
const applyDesignButton = document.querySelector("#applyDesign");
const photoUpload = document.querySelector("#photoUpload");

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusClass(status) {
  if (status === "Approved") return "approved";
  if (status === "Ready") return "ready";
  return "missing";
}

function renderPlayers() {
  playerList.innerHTML = "";

  players.forEach((player) => {
    const row = document.createElement("article");
    row.className = "player-row";

    const thumbContent = player.photo
      ? `<img src="${player.photo}" alt="">`
      : `<span>${initials(player.name)}</span>`;

    row.innerHTML = `
      <div class="player-main">
        <div class="player-thumb">${thumbContent}</div>
        <div>
          <div class="player-name">${player.name}</div>
          <div class="player-meta">${player.position}</div>
        </div>
      </div>
      <span class="player-state ${statusClass(player.status)}">${player.status}</span>
    `;

    playerList.append(row);
  });

  const readyCount = players.filter((player) => player.status === "Ready" || player.status === "Approved").length;
  playerTotal.textContent = players.length;
  readyTotal.textContent = readyCount;
  printTotal.textContent = Number(printCount.value || 1) * players.length;
}

addPlayerButton.addEventListener("click", () => {
  const nameInput = document.querySelector("#playerName");
  const positionInput = document.querySelector("#playerPosition");
  const name = nameInput.value.trim() || `Player ${players.length + 1}`;
  const position = positionInput.value.trim() || "Position to add";

  players.push({
    name,
    position,
    status: "Missing photo",
    photo: "",
  });

  nameInput.value = "";
  positionInput.value = "";
  renderPlayers();
});

photoUpload.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);

  files.forEach((file, index) => {
    const target = players.find((player) => !player.photo) || players[index % players.length];
    if (!target) return;

    target.photo = URL.createObjectURL(file);
    target.status = "Ready";
  });

  renderPlayers();
});

approveReadyButton.addEventListener("click", () => {
  players.forEach((player) => {
    if (player.status === "Ready") player.status = "Approved";
  });
  renderPlayers();
});

applyDesignButton.addEventListener("click", () => {
  applyDesignButton.textContent = "Design applied to all cards";
  window.setTimeout(() => {
    applyDesignButton.textContent = "Apply design to all";
  }, 1800);
});

printCount.addEventListener("input", renderPlayers);

renderPlayers();
