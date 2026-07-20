"use strict";

const LOCAL_STORAGE_KEY = "beach-volley-local-settings-v1";

const DEFAULT_LOCAL_SETTINGS = Object.freeze({
  selectedPlayerIds: [],
  location: "",
  teamSize: 4
});

const state = {
  players: [],
  matches: [],
  selectedPlayerIds: [],
  location: "",
  teamSize: 4,
  loading: false,
  realtimeChannel: null,
  currentTeams: {
    teamA: [],
    teamB: [],
    bench: []
  }
};

const config = window.APP_CONFIG;

if (!config) {
  throw new Error("APP_CONFIG nije pronađen. Provjeri config.js.");
}

if (
  !config.supabaseUrl ||
  !config.supabaseKey ||
  config.supabaseUrl.includes("TVOJ-PROJEKT") ||
  config.supabaseKey.includes("TVOJ_")
) {
  window.alert(
    "Supabase nije konfiguriran. Otvori config.js i upiši URL i ključ projekta."
  );
}

if (!window.supabase) {
  throw new Error("Supabase biblioteka nije učitana.");
}

const supabaseClient = window.supabase.createClient(
  config.supabaseUrl,
  config.supabaseKey
);

const elements = {
  pages: {
    players: document.querySelector("#pagePlayers"),
    game: document.querySelector("#pageGame"),
    history: document.querySelector("#pageHistory"),
    stats: document.querySelector("#pageStats"),
    settings: document.querySelector("#pageSettings")
  },

  navButtons: [...document.querySelectorAll(".nav-button")],

  offlineBanner: document.querySelector("#offlineBanner"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionText: document.querySelector("#connectionText"),

  addPlayerForm: document.querySelector("#addPlayerForm"),
  addPlayerButton: document.querySelector("#addPlayerButton"),
  newPlayerName: document.querySelector("#newPlayerName"),
  managePlayersList: document.querySelector("#managePlayersList"),
  playerCountBadge: document.querySelector("#playerCountBadge"),

  selectPlayersList: document.querySelector("#selectPlayersList"),
  selectedCountBadge: document.querySelector("#selectedCountBadge"),
  selectAllPlayersButton: document.querySelector(
    "#selectAllPlayersButton"
  ),
  clearSelectedPlayersButton: document.querySelector(
    "#clearSelectedPlayersButton"
  ),

  sessionDate: document.querySelector("#sessionDate"),
  sessionLocation: document.querySelector("#sessionLocation"),

  summarySelected: document.querySelector("#summarySelected"),
  summaryRequired: document.querySelector("#summaryRequired"),
  summaryBench: document.querySelector("#summaryBench"),

  gameAlert: document.querySelector("#gameAlert"),
  generateTeamsButton: document.querySelector("#generateTeamsButton"),
  regenerateTeamsButton: document.querySelector(
    "#regenerateTeamsButton"
  ),

  generatedTeamsCard: document.querySelector("#generatedTeamsCard"),
  generatedTeamsDescription: document.querySelector(
    "#generatedTeamsDescription"
  ),

  teamAList: document.querySelector("#teamAList"),
  teamBList: document.querySelector("#teamBList"),

  benchCard: document.querySelector("#benchCard"),
  benchList: document.querySelector("#benchList"),

  teamAScore: document.querySelector("#teamAScore"),
  teamBScore: document.querySelector("#teamBScore"),
  matchNote: document.querySelector("#matchNote"),
  saveMatchButton: document.querySelector("#saveMatchButton"),

  historyList: document.querySelector("#historyList"),
  historyCountBadge: document.querySelector("#historyCountBadge"),

  statsTableWrapper: document.querySelector("#statsTableWrapper"),

  refreshDataButton: document.querySelector("#refreshDataButton"),
  exportDataButton: document.querySelector("#exportDataButton"),

  editPlayerModal: document.querySelector("#editPlayerModal"),
  editPlayerForm: document.querySelector("#editPlayerForm"),
  editPlayerId: document.querySelector("#editPlayerId"),
  editPlayerName: document.querySelector("#editPlayerName"),
  editPlayerActive: document.querySelector("#editPlayerActive"),
  cancelEditPlayerButton: document.querySelector(
    "#cancelEditPlayerButton"
  ),
  savePlayerChangesButton: document.querySelector(
    "#savePlayerChangesButton"
  ),

  toastContainer: document.querySelector("#toastContainer")
};

initializeApp();

async function initializeApp() {
  setToday();
  restoreLocalSettings();
  bindEvents();
  updateNetworkState();

  try {
    setConnectionState("loading");
    await loadAllData();
    subscribeToRealtime();
    setConnectionState("connected");
  } catch (error) {
    console.error("Pokretanje aplikacije nije uspjelo:", error);
    setConnectionState("error");
    showToast(getErrorMessage(error), "error");
  }

  renderAll();
}

function bindEvents() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openPage(button.dataset.page);
    });
  });

  elements.addPlayerForm.addEventListener("submit", handleAddPlayer);
  elements.editPlayerForm.addEventListener("submit", handleEditPlayer);

  elements.cancelEditPlayerButton.addEventListener(
    "click",
    closeEditPlayerModal
  );

  elements.editPlayerModal.addEventListener("click", (event) => {
    if (event.target === elements.editPlayerModal) {
      closeEditPlayerModal();
    }
  });

  document
    .querySelectorAll('input[name="teamSize"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        state.teamSize = getSelectedTeamSize();
        saveLocalSettings();
        clearGeneratedTeams();
        updateGameSummary();
      });
    });

  elements.sessionLocation.addEventListener("input", () => {
    state.location = elements.sessionLocation.value.trim();
    saveLocalSettings();
  });

  elements.selectAllPlayersButton.addEventListener(
    "click",
    selectAllActivePlayers
  );

  elements.clearSelectedPlayersButton.addEventListener(
    "click",
    clearSelectedPlayers
  );

  elements.generateTeamsButton.addEventListener(
    "click",
    generateAndRenderTeams
  );

  elements.regenerateTeamsButton.addEventListener(
    "click",
    generateAndRenderTeams
  );

  elements.saveMatchButton.addEventListener(
    "click",
    saveCurrentMatch
  );

  elements.refreshDataButton.addEventListener(
    "click",
    handleManualRefresh
  );

  elements.exportDataButton.addEventListener("click", exportData);


  window.addEventListener("online", updateNetworkState);
  window.addEventListener("offline", updateNetworkState);

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      elements.editPlayerModal.classList.contains("visible")
    ) {
      closeEditPlayerModal();
    }
  });
}

/* =========================================================
   DATABASE
========================================================= */

async function loadAllData() {
  const [playersResult, matchesResult] = await Promise.all([
    supabaseClient
      .from("players")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),

    supabaseClient
      .from("matches")
      .select("*")
      .order("played_on", { ascending: false })
      .order("created_at", { ascending: false })
  ]);

  if (playersResult.error) {
    throw playersResult.error;
  }

  if (matchesResult.error) {
    throw matchesResult.error;
  }

  state.players = playersResult.data.map(mapDatabasePlayer);
  state.matches = matchesResult.data.map(mapDatabaseMatch);

  removeInvalidSelectedPlayerIds();
}

async function refreshPlayers() {
  const { data, error } = await supabaseClient
    .from("players")
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  state.players = data.map(mapDatabasePlayer);
  removeInvalidSelectedPlayerIds();

  renderPlayers();
  updateGameSummary();
}

async function refreshMatches() {
  const { data, error } = await supabaseClient
    .from("matches")
    .select("*")
    .order("played_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  state.matches = data.map(mapDatabaseMatch);

  renderHistory();
  renderStats();
}

function subscribeToRealtime() {
  if (state.realtimeChannel) {
    supabaseClient.removeChannel(state.realtimeChannel);
  }

  state.realtimeChannel = supabaseClient
    .channel("beach-volley-database")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players"
      },
      async () => {
        try {
          await refreshPlayers();
        } catch (error) {
          console.error("Realtime players greška:", error);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "matches"
      },
      async () => {
        try {
          await refreshMatches();
        } catch (error) {
          console.error("Realtime matches greška:", error);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnectionState("connected");
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setConnectionState("error");
      }
    });
}

function mapDatabasePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    active: player.active !== false,
    createdAt: player.created_at
  };
}

function mapDatabaseMatch(match) {
  return {
    id: match.id,
    date: match.played_on,
    location: match.location || "",
    teamSize: Number(match.team_size),
    teamA: Array.isArray(match.team_a) ? match.team_a : [],
    teamB: Array.isArray(match.team_b) ? match.team_b : [],
    bench: Array.isArray(match.bench) ? match.bench : [],
    scoreA: Number(match.score_a),
    scoreB: Number(match.score_b),
    note: match.note || "",
    createdAt: match.created_at
  };
}

/* =========================================================
   PLAYERS
========================================================= */

async function handleAddPlayer(event) {
  event.preventDefault();

  const name = normalizeName(elements.newPlayerName.value);

  if (!name) {
    showToast("Upiši ime igrača.", "error");
    return;
  }

  if (playerNameExists(name)) {
    showToast("Igrač s tim imenom već postoji.", "error");
    return;
  }

  setButtonLoading(
    elements.addPlayerButton,
    true,
    "Dodavanje..."
  );

  try {
    const { data, error } = await supabaseClient
      .from("players")
      .insert({
        name,
        active: true
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    state.players.push(mapDatabasePlayer(data));
    sortPlayers();

    elements.newPlayerName.value = "";

    renderPlayers();
    updateGameSummary();

    showToast(`${name} je dodan.`, "success");
  } catch (error) {
    console.error("Dodavanje igrača nije uspjelo:", error);

    if (error.code === "23505") {
      showToast("Igrač s tim imenom već postoji.", "error");
    } else {
      showToast(getErrorMessage(error), "error");
    }
  } finally {
    setButtonLoading(
      elements.addPlayerButton,
      false,
      "＋ Dodaj"
    );
  }
}

function openEditPlayerModal(playerId) {
  const player = state.players.find((item) => item.id === playerId);

  if (!player) {
    showToast("Igrač nije pronađen.", "error");
    return;
  }

  elements.editPlayerId.value = player.id;
  elements.editPlayerName.value = player.name;
  elements.editPlayerActive.value = String(player.active);

  elements.editPlayerModal.classList.add("visible");
  elements.editPlayerName.focus();
  elements.editPlayerName.select();
}

function closeEditPlayerModal() {
  elements.editPlayerModal.classList.remove("visible");
  elements.editPlayerForm.reset();
  elements.editPlayerId.value = "";
}

async function handleEditPlayer(event) {
  event.preventDefault();

  const playerId = elements.editPlayerId.value;
  const existingPlayer = state.players.find(
    (player) => player.id === playerId
  );

  if (!existingPlayer) {
    showToast("Igrač nije pronađen.", "error");
    closeEditPlayerModal();
    return;
  }

  const name = normalizeName(elements.editPlayerName.value);
  const active = elements.editPlayerActive.value === "true";

  if (!name) {
    showToast("Ime igrača ne može biti prazno.", "error");
    return;
  }

  if (playerNameExists(name, playerId)) {
    showToast("Igrač s tim imenom već postoji.", "error");
    return;
  }

  setButtonLoading(
    elements.savePlayerChangesButton,
    true,
    "Spremanje..."
  );

  try {
    const { data, error } = await supabaseClient
      .from("players")
      .update({
        name,
        active
      })
      .eq("id", playerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    const playerIndex = state.players.findIndex(
      (player) => player.id === playerId
    );

    state.players[playerIndex] = mapDatabasePlayer(data);

    if (!active) {
      state.selectedPlayerIds = state.selectedPlayerIds.filter(
        (id) => id !== playerId
      );

      saveLocalSettings();
      clearGeneratedTeams();
    }

    sortPlayers();
    closeEditPlayerModal();
    renderPlayers();
    updateGameSummary();

    showToast("Igrač je spremljen.", "success");
  } catch (error) {
    console.error("Uređivanje igrača nije uspjelo:", error);
    showToast(getErrorMessage(error), "error");
  } finally {
    setButtonLoading(
      elements.savePlayerChangesButton,
      false,
      "Spremi"
    );
  }
}

async function deletePlayer(playerId) {
  const player = state.players.find((item) => item.id === playerId);

  if (!player) {
    return;
  }

  const confirmed = window.confirm(
    `Obrisati igrača "${player.name}"?\n\n` +
    "Igrač će ostati zapisan u starim utakmicama."
  );

  if (!confirmed) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("players")
      .delete()
      .eq("id", playerId);

    if (error) {
      throw error;
    }

    state.players = state.players.filter(
      (item) => item.id !== playerId
    );

    state.selectedPlayerIds = state.selectedPlayerIds.filter(
      (id) => id !== playerId
    );

    saveLocalSettings();
    clearGeneratedTeams();
    renderPlayers();
    updateGameSummary();

    showToast(`${player.name} je obrisan.`, "success");
  } catch (error) {
    console.error("Brisanje igrača nije uspjelo:", error);
    showToast(getErrorMessage(error), "error");
  }
}

function playerNameExists(name, ignoredPlayerId = null) {
  const normalizedName = name.toLocaleLowerCase("hr");

  return state.players.some((player) => {
    return (
      player.id !== ignoredPlayerId &&
      player.name.toLocaleLowerCase("hr") === normalizedName
    );
  });
}

function sortPlayers() {
  state.players.sort((playerA, playerB) => {
    if (playerA.active !== playerB.active) {
      return playerA.active ? -1 : 1;
    }

    return playerA.name.localeCompare(playerB.name, "hr");
  });
}

/* =========================================================
   PLAYER SELECTION
========================================================= */

function toggleSelectedPlayer(playerId, selected) {
  if (selected) {
    if (!state.selectedPlayerIds.includes(playerId)) {
      state.selectedPlayerIds.push(playerId);
    }
  } else {
    state.selectedPlayerIds = state.selectedPlayerIds.filter(
      (id) => id !== playerId
    );
  }

  saveLocalSettings();
  clearGeneratedTeams();
  renderSelectPlayers();
  updateGameSummary();
}

function selectAllActivePlayers() {
  state.selectedPlayerIds = state.players
    .filter((player) => player.active)
    .map((player) => player.id);

  saveLocalSettings();
  clearGeneratedTeams();
  renderSelectPlayers();
  updateGameSummary();
}

function clearSelectedPlayers() {
  state.selectedPlayerIds = [];

  saveLocalSettings();
  clearGeneratedTeams();
  renderSelectPlayers();
  updateGameSummary();
}

function removeInvalidSelectedPlayerIds() {
  const validPlayerIds = new Set(
    state.players
      .filter((player) => player.active)
      .map((player) => player.id)
  );

  state.selectedPlayerIds = state.selectedPlayerIds.filter(
    (id) => validPlayerIds.has(id)
  );

  saveLocalSettings();
}

/* =========================================================
   TEAM GENERATION
========================================================= */

function generateAndRenderTeams() {
  hideGameAlert();

  const teamSize = getSelectedTeamSize();

  const selectedPlayers = state.players.filter((player) => {
    return (
      player.active &&
      state.selectedPlayerIds.includes(player.id)
    );
  });

  const requiredPlayers = teamSize * 2;

  if (selectedPlayers.length < requiredPlayers) {
    showGameAlert(
      `Za ${teamSize}v${teamSize} treba najmanje ` +
      `${requiredPlayers} igrača. Odabrano je ${selectedPlayers.length}.`
    );

    return;
  }

  const shuffledPlayers = shuffleArray([...selectedPlayers]);

  state.currentTeams = {
    teamA: shuffledPlayers.slice(0, teamSize),
    teamB: shuffledPlayers.slice(teamSize, requiredPlayers),
    bench: shuffledPlayers.slice(requiredPlayers)
  };

  renderGeneratedTeams();

  elements.generatedTeamsCard.hidden = false;

  elements.generatedTeamsCard.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderGeneratedTeams() {
  elements.teamAList.replaceChildren(
    ...state.currentTeams.teamA.map(createTeamPlayerElement)
  );

  elements.teamBList.replaceChildren(
    ...state.currentTeams.teamB.map(createTeamPlayerElement)
  );

  elements.generatedTeamsDescription.textContent =
    `${state.teamSize}v${state.teamSize} · nasumična podjela`;

  if (state.currentTeams.bench.length > 0) {
    elements.benchCard.hidden = false;

    elements.benchList.replaceChildren(
      ...state.currentTeams.bench.map((player) => {
        const item = document.createElement("span");
        item.className = "bench-player";
        item.textContent = player.name;
        return item;
      })
    );
  } else {
    elements.benchCard.hidden = true;
    elements.benchList.replaceChildren();
  }

  elements.teamAScore.value = "";
  elements.teamBScore.value = "";
  elements.matchNote.value = "";
}

function createTeamPlayerElement(player, index) {
  const item = document.createElement("li");
  item.className = "team-player";

  const number = document.createElement("span");
  number.className = "team-player-number";
  number.textContent = String(index + 1);

  const name = document.createElement("strong");
  name.textContent = player.name;

  item.append(number, name);

  return item;
}

function clearGeneratedTeams() {
  state.currentTeams = {
    teamA: [],
    teamB: [],
    bench: []
  };

  elements.generatedTeamsCard.hidden = true;
  hideGameAlert();
}

/* =========================================================
   MATCHES
========================================================= */

async function saveCurrentMatch() {
  if (
    state.currentTeams.teamA.length === 0 ||
    state.currentTeams.teamB.length === 0
  ) {
    showToast("Prvo generiraj timove.", "error");
    return;
  }

  const date = elements.sessionDate.value;
  const location = elements.sessionLocation.value.trim();
  const scoreA = parseScore(elements.teamAScore.value);
  const scoreB = parseScore(elements.teamBScore.value);
  const note = elements.matchNote.value.trim();

  if (!date) {
    showToast("Odaberi datum.", "error");
    return;
  }

  if (scoreA === null || scoreB === null) {
    showToast("Upiši ispravan rezultat za oba tima.", "error");
    return;
  }

  const databaseMatch = {
    played_on: date,
    location,
    team_size: state.teamSize,
    team_a: state.currentTeams.teamA.map(createPlayerSnapshot),
    team_b: state.currentTeams.teamB.map(createPlayerSnapshot),
    bench: state.currentTeams.bench.map(createPlayerSnapshot),
    score_a: scoreA,
    score_b: scoreB,
    note
  };

  setButtonLoading(
    elements.saveMatchButton,
    true,
    "Spremanje..."
  );

  try {
    const { data, error } = await supabaseClient
      .from("matches")
      .insert(databaseMatch)
      .select()
      .single();

    if (error) {
      throw error;
    }

    state.matches.push(mapDatabaseMatch(data));
    sortMatches();

    state.location = location;
    saveLocalSettings();

    renderHistory();
    renderStats();

    elements.teamAScore.value = "";
    elements.teamBScore.value = "";
    elements.matchNote.value = "";

    showToast("Utakmica je spremljena.", "success");
  } catch (error) {
    console.error("Spremanje utakmice nije uspjelo:", error);
    showToast(getErrorMessage(error), "error");
  } finally {
    setButtonLoading(
      elements.saveMatchButton,
      false,
      "💾 Spremi utakmicu"
    );
  }
}

async function deleteMatch(matchId) {
  const confirmed = window.confirm(
    "Jesi li siguran da želiš obrisati ovu utakmicu?"
  );

  if (!confirmed) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("matches")
      .delete()
      .eq("id", matchId);

    if (error) {
      throw error;
    }

    state.matches = state.matches.filter(
      (match) => match.id !== matchId
    );

    renderHistory();
    renderStats();

    showToast("Utakmica je obrisana.", "success");
  } catch (error) {
    console.error("Brisanje utakmice nije uspjelo:", error);
    showToast(getErrorMessage(error), "error");
  }
}

async function deleteSession(date) {
  const sessionMatches = state.matches.filter(
    (match) => match.date === date
  );

  const confirmed = window.confirm(
    `Obrisati cijeli session ${formatDisplayDate(date)}?\n\n` +
    `Broj utakmica: ${sessionMatches.length}`
  );

  if (!confirmed) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("matches")
      .delete()
      .eq("played_on", date);

    if (error) {
      throw error;
    }

    state.matches = state.matches.filter(
      (match) => match.date !== date
    );

    renderHistory();
    renderStats();

    showToast("Session je obrisan.", "success");
  } catch (error) {
    console.error("Brisanje sessiona nije uspjelo:", error);
    showToast(getErrorMessage(error), "error");
  }
}

function createPlayerSnapshot(player) {
  return {
    id: player.id,
    name: player.name
  };
}

function sortMatches() {
  state.matches.sort((matchA, matchB) => {
    const dateComparison = matchB.date.localeCompare(matchA.date);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return String(matchB.createdAt).localeCompare(
      String(matchA.createdAt)
    );
  });
}

/* =========================================================
   RENDERING
========================================================= */

function renderAll() {
  renderPlayers();
  renderHistory();
  renderStats();
  updateGameSummary();
}

function renderPlayers() {
  renderManagePlayers();
  renderSelectPlayers();

  const activeCount = state.players.filter(
    (player) => player.active
  ).length;

  elements.playerCountBadge.textContent =
    `${activeCount} aktivnih`;
}

function renderManagePlayers() {
  elements.managePlayersList.replaceChildren();

  if (state.players.length === 0) {
    elements.managePlayersList.innerHTML = createEmptyState(
      "👥",
      "Još nema igrača",
      "Dodaj prvog igrača pomoću obrasca iznad."
    );

    return;
  }

  const fragment = document.createDocumentFragment();

  state.players.forEach((player) => {
    const row = document.createElement("div");

    row.className =
      `player-row${player.active ? "" : " inactive"}`;

    const status = document.createElement("span");
    status.textContent = player.active ? "🟢" : "⚪";

    const info = document.createElement("div");

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name;

    const meta = document.createElement("div");
    meta.className = "player-meta";
    meta.textContent = player.active ? "Aktivan" : "Neaktivan";

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "player-actions";

    const editButton = document.createElement("button");
    editButton.className =
      "button button-neutral button-small button-icon";
    editButton.type = "button";
    editButton.textContent = "✏️";
    editButton.title = `Uredi ${player.name}`;

    editButton.addEventListener("click", () => {
      openEditPlayerModal(player.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className =
      "button button-danger button-small button-icon";
    deleteButton.type = "button";
    deleteButton.textContent = "🗑️";
    deleteButton.title = `Obriši ${player.name}`;

    deleteButton.addEventListener("click", () => {
      deletePlayer(player.id);
    });

    actions.append(editButton, deleteButton);
    row.append(status, info, actions);
    fragment.append(row);
  });

  elements.managePlayersList.append(fragment);
}

function renderSelectPlayers() {
  elements.selectPlayersList.replaceChildren();

  const activePlayers = state.players.filter(
    (player) => player.active
  );

  if (activePlayers.length === 0) {
    elements.selectPlayersList.innerHTML = createEmptyState(
      "🏐",
      "Nema aktivnih igrača",
      "Dodaj ili aktiviraj igrače na kartici Igrači."
    );

    return;
  }

  const fragment = document.createDocumentFragment();

  activePlayers.forEach((player) => {
    const selected = state.selectedPlayerIds.includes(player.id);

    const row = document.createElement("label");
    row.className = `player-row${selected ? " selected" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.className = "player-check";
    checkbox.type = "checkbox";
    checkbox.checked = selected;

    checkbox.addEventListener("change", () => {
      toggleSelectedPlayer(player.id, checkbox.checked);
    });

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = selected ? "Prisutno" : "Odaberi";

    row.append(checkbox, name, badge);
    fragment.append(row);
  });

  elements.selectPlayersList.append(fragment);
}

function renderHistory() {
  elements.historyList.replaceChildren();

  elements.historyCountBadge.textContent =
    `${state.matches.length} utakmica`;

  if (state.matches.length === 0) {
    elements.historyList.innerHTML = createEmptyState(
      "📅",
      "Nema spremljenih utakmica",
      "Spremi prvu utakmicu i pojavit će se ovdje."
    );

    return;
  }

  const groupedMatches = groupBy(
    state.matches,
    (match) => match.date
  );

  const fragment = document.createDocumentFragment();

  Object.entries(groupedMatches).forEach(([date, matches]) => {
    const session = document.createElement("section");
    session.className = "history-session";

    const header = document.createElement("div");
    header.className = "history-session-header";

    const headerInfo = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = formatDisplayDate(date);

    const locations = [
      ...new Set(
        matches
          .map((match) => match.location)
          .filter(Boolean)
      )
    ];

    const meta = document.createElement("div");
    meta.className = "history-session-meta";
    meta.textContent =
      `${matches.length} ${pluralizeMatch(matches.length)}` +
      (locations.length ? ` · ${locations.join(", ")}` : "");

    headerInfo.append(title, meta);

    const deleteButton = document.createElement("button");
    deleteButton.className =
      "button button-danger button-small button-icon";
    deleteButton.type = "button";
    deleteButton.textContent = "🗑️";
    deleteButton.title = "Obriši cijeli session";

    deleteButton.addEventListener("click", () => {
      deleteSession(date);
    });

    header.append(headerInfo, deleteButton);

    const games = document.createElement("div");
    games.className = "history-games";

    matches.forEach((match, index) => {
      games.append(createHistoryMatch(match, index + 1));
    });

    session.append(header, games);
    fragment.append(session);
  });

  elements.historyList.append(fragment);
}

function createHistoryMatch(match, gameNumber) {
  const article = document.createElement("article");
  article.className = "history-game";

  const top = document.createElement("div");
  top.className = "history-game-top";

  const title = document.createElement("strong");
  title.textContent =
    `Utakmica ${gameNumber} · ${match.teamSize}v${match.teamSize}`;

  const score = document.createElement("span");
  score.className = "history-score";
  score.textContent = `${match.scoreA} : ${match.scoreB}`;

  top.append(title, score);

  const result =
    match.scoreA === match.scoreB
      ? "draw"
      : match.scoreA > match.scoreB
        ? "A"
        : "B";

  const teamA = document.createElement("div");
  teamA.className = "history-team";

  const teamALabel = document.createElement("strong");
  teamALabel.textContent = "Tim A: ";

  if (result === "A") {
    teamALabel.classList.add("winner-text");
  }

  teamA.append(
    teamALabel,
    document.createTextNode(
      match.teamA.map((player) => player.name).join(", ")
    )
  );

  const teamB = document.createElement("div");
  teamB.className = "history-team";

  const teamBLabel = document.createElement("strong");
  teamBLabel.textContent = "Tim B: ";

  if (result === "B") {
    teamBLabel.classList.add("winner-text");
  }

  teamB.append(
    teamBLabel,
    document.createTextNode(
      match.teamB.map((player) => player.name).join(", ")
    )
  );

  article.append(top, teamA, teamB);

  if (match.bench.length > 0) {
    const bench = document.createElement("div");
    bench.className = "player-meta";
    bench.textContent =
      `Klupa: ${match.bench
        .map((player) => player.name)
        .join(", ")}`;

    article.append(bench);
  }

  if (match.note) {
    const note = document.createElement("div");
    note.className = "player-meta";
    note.textContent = `Napomena: ${match.note}`;

    article.append(note);
  }

  const actions = document.createElement("div");
  actions.className = "history-actions";

  const copyButton = document.createElement("button");
  copyButton.className = "button button-neutral button-small";
  copyButton.type = "button";
  copyButton.textContent = "📋 Kopiraj";

  copyButton.addEventListener("click", () => {
    copyMatchSummary(match);
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "button button-danger button-small";
  deleteButton.type = "button";
  deleteButton.textContent = "Obriši";

  deleteButton.addEventListener("click", () => {
    deleteMatch(match.id);
  });

  actions.append(copyButton, deleteButton);
  article.append(actions);

  return article;
}

function renderStats() {
  const statistics = calculateStatistics();

  if (statistics.length === 0) {
    elements.statsTableWrapper.innerHTML = createEmptyState(
      "🏆",
      "Još nema statistike",
      "Statistika će se pojaviti nakon prve utakmice."
    );

    return;
  }

  const table = document.createElement("table");
  table.className = "stats-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Igrač</th>
        <th>Utakmice</th>
        <th>Pobjede</th>
        <th>Porazi</th>
        <th>Neriješeno</th>
        <th>Uspješnost</th>
        <th>Bod-razlika</th>
      </tr>
    </thead>
  `;

  const body = document.createElement("tbody");

  statistics.forEach((player, index) => {
    const row = document.createElement("tr");

    const rankClass =
      index === 0
        ? "gold"
        : index === 1
          ? "silver"
          : index === 2
            ? "bronze"
            : "";

    row.innerHTML = `
      <td>
        <span class="rank ${rankClass}">
          ${index + 1}
        </span>
      </td>
      <td><strong>${escapeHtml(player.name)}</strong></td>
      <td>${player.games}</td>
      <td>${player.wins}</td>
      <td>${player.losses}</td>
      <td>${player.draws}</td>
      <td><strong>${player.winRate.toFixed(1)}%</strong></td>
      <td>${formatSignedNumber(player.pointDifference)}</td>
    `;

    body.append(row);
  });

  table.append(body);
  elements.statsTableWrapper.replaceChildren(table);
}

function calculateStatistics() {
  const statistics = new Map();

  state.matches.forEach((match) => {
    const result =
      match.scoreA === match.scoreB
        ? "draw"
        : match.scoreA > match.scoreB
          ? "A"
          : "B";

    match.teamA.forEach((player) => {
      const playerStats = getOrCreatePlayerStats(
        statistics,
        player
      );

      playerStats.games += 1;
      playerStats.pointsFor += match.scoreA;
      playerStats.pointsAgainst += match.scoreB;

      if (result === "draw") {
        playerStats.draws += 1;
      } else if (result === "A") {
        playerStats.wins += 1;
      } else {
        playerStats.losses += 1;
      }
    });

    match.teamB.forEach((player) => {
      const playerStats = getOrCreatePlayerStats(
        statistics,
        player
      );

      playerStats.games += 1;
      playerStats.pointsFor += match.scoreB;
      playerStats.pointsAgainst += match.scoreA;

      if (result === "draw") {
        playerStats.draws += 1;
      } else if (result === "B") {
        playerStats.wins += 1;
      } else {
        playerStats.losses += 1;
      }
    });
  });

  return [...statistics.values()]
    .map((player) => ({
      ...player,
      winRate:
        player.games > 0
          ? (player.wins / player.games) * 100
          : 0,
      pointDifference:
        player.pointsFor - player.pointsAgainst
    }))
    .sort((playerA, playerB) => {
      if (playerB.wins !== playerA.wins) {
        return playerB.wins - playerA.wins;
      }

      if (playerB.winRate !== playerA.winRate) {
        return playerB.winRate - playerA.winRate;
      }

      if (
        playerB.pointDifference !== playerA.pointDifference
      ) {
        return (
          playerB.pointDifference - playerA.pointDifference
        );
      }

      return playerA.name.localeCompare(playerB.name, "hr");
    });
}

function getOrCreatePlayerStats(statistics, player) {
  const key = player.id || player.name.toLocaleLowerCase("hr");

  if (!statistics.has(key)) {
    statistics.set(key, {
      id: player.id,
      name: player.name,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0
    });
  }

  return statistics.get(key);
}

/* =========================================================
   SETTINGS AND BACKUP
========================================================= */

async function handleManualRefresh() {
  setButtonLoading(
    elements.refreshDataButton,
    true,
    "Osvježavanje..."
  );

  try {
    await loadAllData();
    renderAll();
    setConnectionState("connected");
    showToast("Podaci su osvježeni.", "success");
  } catch (error) {
    console.error("Osvježavanje nije uspjelo:", error);
    setConnectionState("error");
    showToast(getErrorMessage(error), "error");
  } finally {
    setButtonLoading(
      elements.refreshDataButton,
      false,
      "🔄 Osvježi"
    );
  }
}

function exportData() {
  const payload = {
    application: "Beach Volley Teams",
    version: 2,
    exportedAt: new Date().toISOString(),
    players: state.players,
    matches: state.matches
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download =
    `beach-volley-backup-${formatDateForInput(new Date())}.json`;

  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  showToast("Backup je preuzet.", "success");
}

function restoreLocalSettings() {
  try {
    const rawSettings = localStorage.getItem(
      LOCAL_STORAGE_KEY
    );

    if (!rawSettings) {
      applyLocalSettings(DEFAULT_LOCAL_SETTINGS);
      return;
    }

    const parsedSettings = JSON.parse(rawSettings);

    applyLocalSettings({
      ...DEFAULT_LOCAL_SETTINGS,
      ...parsedSettings
    });
  } catch (error) {
    console.error(
      "Lokalne postavke nisu učitane:",
      error
    );

    applyLocalSettings(DEFAULT_LOCAL_SETTINGS);
  }
}

function applyLocalSettings(settings) {
  state.selectedPlayerIds = Array.isArray(
    settings.selectedPlayerIds
  )
    ? settings.selectedPlayerIds
    : [];

  state.location =
    typeof settings.location === "string"
      ? settings.location
      : "";

  state.teamSize = [2, 3, 4, 5].includes(
    Number(settings.teamSize)
  )
    ? Number(settings.teamSize)
    : 4;

  elements.sessionLocation.value = state.location;

  const selectedTeamSizeInput = document.querySelector(
    `input[name="teamSize"][value="${state.teamSize}"]`
  );

  if (selectedTeamSizeInput) {
    selectedTeamSizeInput.checked = true;
  }
}

function saveLocalSettings() {
  const settings = {
    selectedPlayerIds: state.selectedPlayerIds,
    location: state.location,
    teamSize: state.teamSize
  };

  localStorage.setItem(
    LOCAL_STORAGE_KEY,
    JSON.stringify(settings)
  );
}

function clearLocalSettings() {
  const confirmed = window.confirm(
    "Očistiti lokalno označene igrače, lokaciju i format igre?\n\n" +
    "Igrači i utakmice u Supabase bazi neće biti obrisani."
  );

  if (!confirmed) {
    return;
  }

  localStorage.removeItem(LOCAL_STORAGE_KEY);

  state.selectedPlayerIds = [];
  state.location = "";
  state.teamSize = 4;

  elements.sessionLocation.value = "";

  const teamSizeInput = document.querySelector(
    'input[name="teamSize"][value="4"]'
  );

  if (teamSizeInput) {
    teamSizeInput.checked = true;
  }

  clearGeneratedTeams();
  renderSelectPlayers();
  updateGameSummary();

  showToast("Lokalne postavke su očišćene.", "success");
}

/* =========================================================
   NAVIGATION AND UI
========================================================= */

function openPage(pageName) {
  Object.entries(elements.pages).forEach(([name, page]) => {
    page.classList.toggle("active", name === pageName);
  });

  elements.navButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  if (pageName === "history") {
    renderHistory();
  }

  if (pageName === "stats") {
    renderStats();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function updateGameSummary() {
  state.teamSize = getSelectedTeamSize();

  const activeSelectedCount = state.selectedPlayerIds.filter(
    (playerId) =>
      state.players.some(
        (player) =>
          player.id === playerId && player.active
      )
  ).length;

  const requiredPlayers = state.teamSize * 2;
  const benchCount = Math.max(
    0,
    activeSelectedCount - requiredPlayers
  );

  elements.summarySelected.textContent =
    String(activeSelectedCount);

  elements.summaryRequired.textContent =
    String(requiredPlayers);

  elements.summaryBench.textContent =
    String(benchCount);

  elements.selectedCountBadge.textContent =
    `${activeSelectedCount} prisutnih`;

  elements.generateTeamsButton.disabled =
    activeSelectedCount < requiredPlayers;
}

function showGameAlert(message) {
  elements.gameAlert.textContent = message;
  elements.gameAlert.classList.add("visible");
}

function hideGameAlert() {
  elements.gameAlert.textContent = "";
  elements.gameAlert.classList.remove("visible");
}

function updateNetworkState() {
  const online = navigator.onLine;

  elements.offlineBanner.hidden = online;

  if (!online) {
    setConnectionState("error", "Offline");
  }
}

function setConnectionState(stateName, customText = "") {
  elements.connectionDot.classList.remove(
    "connected",
    "error"
  );

  if (stateName === "connected") {
    elements.connectionDot.classList.add("connected");
    elements.connectionText.textContent =
      customText || "Baza povezana";
    return;
  }

  if (stateName === "error") {
    elements.connectionDot.classList.add("error");
    elements.connectionText.textContent =
      customText || "Greška veze";
    return;
  }

  elements.connectionText.textContent =
    customText || "Povezivanje...";
}

function showToast(message, type = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;

  elements.toastContainer.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

function setButtonLoading(button, loading, label) {
  button.disabled = loading;
  button.textContent = label;
}

/* =========================================================
   COPY RESULT
========================================================= */

async function copyMatchSummary(match) {
  const winner =
    match.scoreA === match.scoreB
      ? "Neriješeno"
      : match.scoreA > match.scoreB
        ? "Tim A"
        : "Tim B";

  const lines = [
    `🏐 Odbojka na pijesku — ${formatDisplayDate(match.date)}`,
    match.location ? `📍 ${match.location}` : null,
    "",
    `Tim A: ${match.teamA
      .map((player) => player.name)
      .join(", ")}`,
    `Tim B: ${match.teamB
      .map((player) => player.name)
      .join(", ")}`,
    match.bench.length
      ? `Klupa: ${match.bench
          .map((player) => player.name)
          .join(", ")}`
      : null,
    "",
    `Rezultat: ${match.scoreA}:${match.scoreB}`,
    `Pobjednik: ${winner}`,
    match.note ? `Napomena: ${match.note}` : null
  ].filter((line) => line !== null);

  const text = lines.join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showToast("Rezultat je kopiran.", "success");
  } catch (error) {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";

  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand("copy");

  textarea.remove();

  showToast(
    copied
      ? "Rezultat je kopiran."
      : "Kopiranje nije uspjelo.",
    copied ? "success" : "error"
  );
}

/* =========================================================
   HELPERS
========================================================= */

function setToday() {
  elements.sessionDate.value = formatDateForInput(
    new Date()
  );
}

function getSelectedTeamSize() {
  const selectedInput = document.querySelector(
    'input[name="teamSize"]:checked'
  );

  const teamSize = Number(selectedInput?.value || 4);

  return [2, 3, 4, 5].includes(teamSize)
    ? teamSize
    : 4;
}

function parseScore(value) {
  if (value === "") {
    return null;
  }

  const score = Number(value);

  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 999
  ) {
    return null;
  }

  return score;
}

function normalizeName(value) {
  const normalized = String(value)
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return (
    normalized.charAt(0).toLocaleUpperCase("hr") +
    normalized.slice(1)
  );
}

function shuffleArray(array) {
  for (
    let currentIndex = array.length - 1;
    currentIndex > 0;
    currentIndex -= 1
  ) {
    const randomIndex = Math.floor(
      Math.random() * (currentIndex + 1)
    );

    [
      array[currentIndex],
      array[randomIndex]
    ] = [
      array[randomIndex],
      array[currentIndex]
    ];
  }

  return array;
}

function formatDateForInput(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateString) {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(item);

    return groups;
  }, {});
}

function pluralizeMatch(count) {
  if (count === 1) {
    return "utakmica";
  }

  if (count >= 2 && count <= 4) {
    return "utakmice";
  }

  return "utakmica";
}

function formatSignedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}

function createEmptyState(icon, title, description) {
  return `
    <div class="empty-state">
      <span class="empty-state-icon" aria-hidden="true">
        ${icon}
      </span>

      <strong>${escapeHtml(title)}</strong>

      <div>
        ${escapeHtml(description)}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getErrorMessage(error) {
  if (!navigator.onLine) {
    return "Nema internetske veze.";
  }

  if (error?.code === "23505") {
    return "Zapis s tim nazivom već postoji.";
  }

  if (error?.code === "42501") {
    return (
      "Supabase je odbio operaciju. Provjeri RLS politike " +
      "i je li SQL skripta ispravno pokrenuta."
    );
  }

  if (typeof error?.message === "string") {
    return error.message;
  }

  return "Dogodila se neočekivana greška.";
}