"use strict";

const config = window.APP_CONFIG;

if (!config || !window.supabase) {
  throw new Error("Supabase konfiguracija ili biblioteka nije učitana.");
}

const supabaseClient = window.supabase.createClient(
  config.supabaseUrl,
  config.supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const state = {
  user: null,
  players: [],
  sessions: [],
  activeSession: null,
  realtimeChannel: null,
  saving: false
};

const elements = {
  pages: {
    session: document.querySelector("#pageSession"),
    players: document.querySelector("#pagePlayers"),
    history: document.querySelector("#pageHistory"),
    stats: document.querySelector("#pageStats"),
    settings: document.querySelector("#pageSettings")
  },

  navButtons: [...document.querySelectorAll(".nav-button")],

  offlineBanner: document.querySelector("#offlineBanner"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionText: document.querySelector("#connectionText"),

  roleBanner: document.querySelector("#roleBanner"),
  roleTitle: document.querySelector("#roleTitle"),
  roleDescription: document.querySelector("#roleDescription"),

  openLoginButton: document.querySelector("#openLoginButton"),
  logoutButton: document.querySelector("#logoutButton"),

  sessionContent: document.querySelector("#sessionContent"),

  addPlayerForm: document.querySelector("#addPlayerForm"),
  newPlayerName: document.querySelector("#newPlayerName"),
  addPlayerButton: document.querySelector("#addPlayerButton"),
  managePlayersList: document.querySelector("#managePlayersList"),
  playerCountBadge: document.querySelector("#playerCountBadge"),

  historyList: document.querySelector("#historyList"),
  historyCountBadge: document.querySelector("#historyCountBadge"),
  statsTableWrapper: document.querySelector("#statsTableWrapper"),

  refreshDataButton: document.querySelector("#refreshDataButton"),
  exportDataButton: document.querySelector("#exportDataButton"),

  loginModal: document.querySelector("#loginModal"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginButton: document.querySelector("#loginButton"),
  loginError: document.querySelector("#loginError"),
  cancelLoginButton: document.querySelector("#cancelLoginButton"),

  editPlayerModal: document.querySelector("#editPlayerModal"),
  editPlayerForm: document.querySelector("#editPlayerForm"),
  editPlayerId: document.querySelector("#editPlayerId"),
  editPlayerName: document.querySelector("#editPlayerName"),
  editPlayerActive: document.querySelector("#editPlayerActive"),
  cancelEditPlayerButton: document.querySelector(
    "#cancelEditPlayerButton"
  ),

  lineupModal: document.querySelector("#lineupModal"),
  lineupRoundId: document.querySelector("#lineupRoundId"),
  lineupMatchId: document.querySelector("#lineupMatchId"),
  lineupTeam1Title: document.querySelector("#lineupTeam1Title"),
  lineupTeam2Title: document.querySelector("#lineupTeam2Title"),
  lineupTeam1List: document.querySelector("#lineupTeam1List"),
  lineupTeam2List: document.querySelector("#lineupTeam2List"),
  lineupError: document.querySelector("#lineupError"),
  cancelLineupButton: document.querySelector("#cancelLineupButton"),
  saveLineupButton: document.querySelector("#saveLineupButton"),

  toastContainer: document.querySelector("#toastContainer")
};

initializeApp();

/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeApp() {
  bindStaticEvents();
  updateNetworkState();
  setConnectionState("loading");

  try {
    const {
      data: { session },
      error
    } = await supabaseClient.auth.getSession();

    if (error) {
      throw error;
    }

    state.user = session?.user || null;

    await loadAllData();
    subscribeToRealtime();

    setConnectionState("connected");
  } catch (error) {
    console.error("Pokretanje aplikacije nije uspjelo:", error);
    setConnectionState("error");
    showToast(getErrorMessage(error), "error");
  }

  updateRoleInterface();
  safeRenderAll();

  supabaseClient.auth.onAuthStateChange(
    async (_event, session) => {
      state.user = session?.user || null;
      updateRoleInterface();

      try {
        await loadAllData();
        safeRenderAll();
      } catch (error) {
        console.error(
          "Greška nakon promjene prijave:",
          error
        );

        showSessionRenderError(error);
      }
    }
  );
}

function safeRenderAll() {
  try {
    renderAll();
  } catch (error) {
    console.error(
      "Greška tijekom prikaza aplikacije:",
      error
    );

    showSessionRenderError(error);
  }
}

function showSessionRenderError(error) {
  elements.sessionContent.innerHTML = `
    <article class="card">
      <div class="alert alert-error visible">
        <strong>Aplikacija nije mogla prikazati session.</strong>

        <div style="margin-top: 8px;">
          ${escapeHtml(
            error?.message || "Nepoznata greška."
          )}
        </div>
      </div>
    </article>
  `;
}

function bindStaticEvents() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openPage(button.dataset.page);
    });
  });

  elements.openLoginButton?.addEventListener(
    "click",
    openLoginModal
  );

  elements.cancelLoginButton?.addEventListener(
    "click",
    closeLoginModal
  );

  elements.loginForm?.addEventListener(
    "submit",
    handleLogin
  );

  elements.logoutButton?.addEventListener(
    "click",
    handleLogout
  );

  elements.loginModal?.addEventListener("click", (event) => {
    if (event.target === elements.loginModal) {
      closeLoginModal();
    }
  });

  elements.addPlayerForm?.addEventListener(
    "submit",
    handleAddPlayer
  );

  elements.editPlayerForm?.addEventListener(
    "submit",
    handleEditPlayer
  );

  elements.cancelEditPlayerButton?.addEventListener(
    "click",
    closeEditPlayerModal
  );

  elements.editPlayerModal?.addEventListener("click", (event) => {
    if (event.target === elements.editPlayerModal) {
      closeEditPlayerModal();
    }
  });

  elements.cancelLineupButton?.addEventListener(
    "click",
    closeLineupModal
  );

  elements.saveLineupButton?.addEventListener(
    "click",
    saveLineupFromModal
  );

  elements.lineupModal?.addEventListener("click", (event) => {
    if (event.target === elements.lineupModal) {
      closeLineupModal();
    }
  });

  elements.refreshDataButton?.addEventListener(
    "click",
    handleRefresh
  );

  elements.exportDataButton?.addEventListener(
    "click",
    exportData
  );

  window.addEventListener("online", updateNetworkState);
  window.addEventListener("offline", updateNetworkState);
}

/* =========================================================
   DATA LOADING
========================================================= */

async function loadAllData() {
  const [playersResult, sessionsResult] = await Promise.all([
    supabaseClient
      .from("players")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true }),

    supabaseClient
      .from("sessions")
      .select("*")
      .order("played_on", { ascending: false })
      .order("created_at", { ascending: false })
  ]);

  if (playersResult.error) {
    throw playersResult.error;
  }

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  state.players = playersResult.data.map(mapPlayer);
  state.sessions = sessionsResult.data.map(mapSession);

  state.activeSession =
    state.sessions.find((session) => session.status === "active") ||
    null;
}

function mapPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    active: row.active !== false,
    createdAt: row.created_at
  };
}

function mapSession(row) {
  return {
    id: row.id,
    date: row.played_on,
    location: row.location || "",
    teamSize: Number(row.team_size),
    status: row.status,
    sessionState: normalizeSessionState(row.state),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSessionState(value) {
  const source =
    value && typeof value === "object"
      ? value
      : {};

  const participants = Array.isArray(source.participants)
    ? source.participants.map((participant) => ({
        id: participant.id,
        name: participant.name || "Nepoznati igrač",
        status: participant.status || "active",
        joinedAt: participant.joinedAt || null,
        leftAt: participant.leftAt || null,
        returnedAt: participant.returnedAt || null,
        nextRoundOnly: Boolean(participant.nextRoundOnly)
      }))
    : [];

  const rounds = Array.isArray(source.rounds)
    ? source.rounds.map((round, roundIndex) => {
        const teams = Array.isArray(round.teams)
          ? round.teams.map((team, teamIndex) => ({
              id: team.id || createId(),

              label:
                team.label ||
                (team.bench
                  ? "Klupa"
                  : `Tim ${getTeamLetter(teamIndex)}`),

              shortLabel:
                team.shortLabel ||
                (team.bench
                  ? "Klupa"
                  : getTeamLetter(teamIndex)),

              bench: Boolean(team.bench),

              players: Array.isArray(team.players)
                ? team.players.map((player) => ({
                    id: player.id,
                    name: player.name || "Nepoznati igrač"
                  }))
                : []
            }))
          : [];

        const matches = Array.isArray(round.matches)
          ? round.matches.map((match, matchIndex) => {
              const oldLoan = match.loan
                ? [match.loan]
                : [];

              const normalizedLoans = Array.isArray(match.loans)
                ? match.loans
                : oldLoan;

              const team1Players = Array.isArray(match.team1Players)
                ? match.team1Players
                : [];

              const team2Players = Array.isArray(match.team2Players)
                ? match.team2Players
                : [];

              return {
                id: match.id || createId(),
                number: Number(match.number || matchIndex + 1),
                status: match.status || "pending",

                team1Id: match.team1Id || null,
                team2Id: match.team2Id || null,

                team1LineupIds: Array.isArray(match.team1LineupIds)
                  ? match.team1LineupIds
                  : team1Players.map((player) => player.id),

                team2LineupIds: Array.isArray(match.team2LineupIds)
                  ? match.team2LineupIds
                  : team2Players.map((player) => player.id),

                team1Players,
                team2Players,

                loans: normalizedLoans,

                score1:
                  match.score1 === null ||
                  match.score1 === undefined
                    ? null
                    : Number(match.score1),

                score2:
                  match.score2 === null ||
                  match.score2 === undefined
                    ? null
                    : Number(match.score2),

                winnerTeamId: match.winnerTeamId || null,
                loserTeamId: match.loserTeamId || null,

                createdAt:
                  match.createdAt ||
                  new Date().toISOString()
              };
            })
          : [];

        return {
          id: round.id || createId(),
          number: Number(round.number || roundIndex + 1),
          status: round.status || "active",
          teams,
          matches,

          schedule: Array.isArray(round.schedule)
            ? round.schedule
            : [],

          createdAt:
            round.createdAt ||
            new Date().toISOString()
        };
      })
    : [];

  let currentRoundId = source.currentRoundId || null;

  if (
    currentRoundId &&
    !rounds.some((round) => round.id === currentRoundId)
  ) {
    currentRoundId = null;
  }

  if (!currentRoundId && rounds.length > 0) {
    currentRoundId = rounds[rounds.length - 1].id;
  }

  return {
    participants,
    rounds,
    currentRoundId
  };
}

/* =========================================================
   REALTIME
========================================================= */

function subscribeToRealtime() {
  if (state.realtimeChannel) {
    supabaseClient.removeChannel(state.realtimeChannel);
  }

  state.realtimeChannel = supabaseClient
    .channel("volleyball-live-v8")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players"
      },
      refreshFromRealtime
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sessions"
      },
      refreshFromRealtime
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

async function refreshFromRealtime() {
  if (state.saving) {
    return;
  }

  try {
    await loadAllData();
    safeRenderAll();
  } catch (error) {
    console.error(
      "Realtime osvježavanje nije uspjelo:",
      error
    );
  }
}

/* =========================================================
   AUTH
========================================================= */

function usernameToEmail(value) {
  const input = String(value).trim().toLowerCase();

  if (!input) {
    throw new Error("Upiši korisničko ime ili email.");
  }

  if (input.includes("@")) {
    return input;
  }

  const username = input.replace(/[^a-z0-9._-]/g, "");

  if (!username) {
    throw new Error("Neispravno korisničko ime.");
  }

  const domain = String(config.authEmailDomain || "")
    .trim()
    .replace(/^@+/, "");

  if (!domain) {
    throw new Error("Auth email domena nije postavljena.");
  }

  return `${username}@${domain}`;
}

async function handleLogin(event) {
  event.preventDefault();

  elements.loginError.textContent = "";
  elements.loginError.classList.remove("visible");

  setButtonLoading(
    elements.loginButton,
    true,
    "Prijava..."
  );

  try {
    const email = usernameToEmail(
      elements.loginUsername.value
    );

    const password = elements.loginPassword.value;

    if (!password) {
      throw new Error("Upiši lozinku.");
    }

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    if (!data.user || !data.session) {
      throw new Error(
        "Supabase nije vratio aktivnu prijavu."
      );
    }

    state.user = data.user;

    elements.loginForm.reset();
    closeLoginModal();

    await loadAllData();
    updateRoleInterface();
    safeRenderAll();

    showToast(
      "Prijavljen si kao Admin.",
      "success"
    );
  } catch (error) {
    console.error("Login greška:", error);

    const original =
      error?.message || "Prijava nije uspjela.";

    let message = original;

    if (
      original
        .toLowerCase()
        .includes("invalid login credentials")
    ) {
      message = "Email ili lozinka nisu ispravni.";
    } else if (
      original
        .toLowerCase()
        .includes("email not confirmed")
    ) {
      message = "Email nije potvrđen u Supabaseu.";
    }

    elements.loginError.textContent = message;
    elements.loginError.classList.add("visible");
  } finally {
    setButtonLoading(
      elements.loginButton,
      false,
      "Prijavi se"
    );
  }
}

async function handleLogout() {
  const { error } = await supabaseClient.auth.signOut({
    scope: "local"
  });

  if (error) {
    showToast(getErrorMessage(error), "error");
    return;
  }

  state.user = null;

  updateRoleInterface();
  safeRenderAll();

  showToast("Odjavljen si.", "success");
}

function openLoginModal() {
  elements.loginModal.classList.add("visible");
  elements.loginUsername.focus();
}

function closeLoginModal() {
  elements.loginModal.classList.remove("visible");
  elements.loginError.classList.remove("visible");
}

function isAdmin() {
  return Boolean(state.user);
}

function requireAdmin() {
  if (!isAdmin()) {
    showToast(
      "Za ovu radnju moraš biti prijavljen kao Admin.",
      "error"
    );

    return false;
  }

  if (!navigator.onLine) {
    showToast(
      "Admin promjene nisu dostupne bez interneta.",
      "error"
    );

    return false;
  }

  return true;
}

function updateRoleInterface() {
  const admin = isAdmin();

  elements.openLoginButton.hidden = admin;
  elements.logoutButton.hidden = !admin;

  elements.roleBanner.classList.toggle("viewer", !admin);
  elements.roleBanner.classList.toggle("admin", admin);

  elements.roleTitle.textContent = admin
    ? "Admin"
    : "Način gledatelja";

  elements.roleDescription.textContent = admin
    ? "Možeš upravljati igračima, sessionom, rundama i rezultatima."
    : "Možeš gledati session i rezultate, ali ne možeš ništa mijenjati.";

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !admin;
  });
}

/* =========================================================
   PLAYERS
========================================================= */

async function handleAddPlayer(event) {
  event.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const name = normalizeName(elements.newPlayerName.value);

  if (!name) {
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

    state.players.push(mapPlayer(data));
    sortPlayers();

    elements.newPlayerName.value = "";

    renderPlayers();

    showToast(`${name} je dodan.`, "success");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    setButtonLoading(
      elements.addPlayerButton,
      false,
      "＋ Dodaj"
    );
  }
}

function openEditPlayerModal(playerId) {
  if (!requireAdmin()) {
    return;
  }

  const player = state.players.find(
    (item) => item.id === playerId
  );

  if (!player) {
    return;
  }

  elements.editPlayerId.value = player.id;
  elements.editPlayerName.value = player.name;
  elements.editPlayerActive.value = String(player.active);

  elements.editPlayerModal.classList.add("visible");
}

function closeEditPlayerModal() {
  elements.editPlayerModal.classList.remove("visible");
  elements.editPlayerForm.reset();
}

async function handleEditPlayer(event) {
  event.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const playerId = elements.editPlayerId.value;
  const name = normalizeName(elements.editPlayerName.value);
  const active = elements.editPlayerActive.value === "true";

  try {
    const { error } = await supabaseClient
      .from("players")
      .update({ name, active })
      .eq("id", playerId);

    if (error) {
      throw error;
    }

    await loadAllData();

    closeEditPlayerModal();
    safeRenderAll();

    showToast("Igrač je spremljen.", "success");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

async function deletePlayer(playerId) {
  if (!requireAdmin()) {
    return;
  }

  const player = state.players.find(
    (item) => item.id === playerId
  );

  if (
    !player ||
    !window.confirm(`Obrisati igrača "${player.name}"?`)
  ) {
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

    await loadAllData();
    safeRenderAll();

    showToast("Igrač je obrisan.", "success");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

function sortPlayers() {
  state.players.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    return a.name.localeCompare(b.name, "hr");
  });
}

/* =========================================================
   SESSION CREATION
========================================================= */

function renderNoActiveSession() {
  if (!isAdmin()) {
    return `
      <article class="card">
        ${emptyState(
          "🏐",
          "Trenutno nema aktivnog sessiona",
          "Kad Admin pokrene session, ovdje će se pojaviti timovi i rezultati."
        )}
      </article>
    `;
  }

  const activePlayers = state.players.filter(
    (player) => player.active
  );

  const playerOptions = activePlayers
    .map((player) => `
      <label class="player-row">
        <input
          class="player-check session-player-checkbox"
          type="checkbox"
          value="${escapeHtml(player.id)}"
        >

        <span class="player-name">
          ${escapeHtml(player.name)}
        </span>

        <span class="badge">Odaberi</span>
      </label>
    `)
    .join("");

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Pokreni novi session</h2>

          <p class="card-subtitle">
            Odaberi igrače, format i lokaciju.
          </p>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="newSessionDate">
            Datum
          </label>

          <input
            class="input"
            id="newSessionDate"
            type="date"
            value="${formatDateForInput(new Date())}"
          >
        </div>

        <div class="form-group">
          <label class="form-label" for="newSessionLocation">
            Lokacija
          </label>

          <input
            class="input"
            id="newSessionLocation"
            type="text"
            maxlength="80"
            value="${escapeHtml(config.defaultLocation || "")}"
          >
        </div>
      </div>

      <div class="form-group">
        <span class="form-label">Format</span>

        <div class="segmented-control">
          ${[3, 4, 5].map((size) => `
            <div>
              <input
                class="segment-input"
                id="newTeamSize${size}"
                name="newTeamSize"
                type="radio"
                value="${size}"
                ${size === 4 ? "checked" : ""}
              >

              <label
                class="segment-label"
                for="newTeamSize${size}"
              >
                ${size}v${size}
              </label>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="button-row">
        <button
          class="button button-neutral button-small"
          id="selectAllSessionPlayers"
          type="button"
        >
          Odaberi sve
        </button>

        <button
          class="button button-neutral button-small"
          id="clearSessionPlayers"
          type="button"
        >
          Makni sve
        </button>
      </div>

      <div class="spacer"></div>

      <div class="players-list">
        ${playerOptions || emptyState(
          "👥",
          "Nema aktivnih igrača",
          "Prvo dodaj igrače na kartici Igrači."
        )}
      </div>

      <div class="spacer"></div>

      <button
        class="button button-block"
        id="startSessionButton"
        type="button"
      >
        ▶️ Pokreni session
      </button>
    </article>
  `;
}

function bindNoSessionEvents() {
  if (!isAdmin()) {
    return;
  }

  document
    .querySelector("#selectAllSessionPlayers")
    ?.addEventListener("click", () => {
      document
        .querySelectorAll(".session-player-checkbox")
        .forEach((checkbox) => {
          checkbox.checked = true;
        });
    });

  document
    .querySelector("#clearSessionPlayers")
    ?.addEventListener("click", () => {
      document
        .querySelectorAll(".session-player-checkbox")
        .forEach((checkbox) => {
          checkbox.checked = false;
        });
    });

  document
    .querySelector("#startSessionButton")
    ?.addEventListener("click", startSession);
}

async function startSession() {
  if (!requireAdmin()) {
    return;
  }

  const selectedIds = [
    ...document.querySelectorAll(
      ".session-player-checkbox:checked"
    )
  ].map((checkbox) => checkbox.value);

  const teamSize = Number(
    document.querySelector(
      'input[name="newTeamSize"]:checked'
    )?.value || 4
  );

  if (selectedIds.length < teamSize * 2) {
    showToast(
      `Za ${teamSize}v${teamSize} treba najmanje ${teamSize * 2} igrača.`,
      "error"
    );

    return;
  }

  const participants = state.players
    .filter((player) => selectedIds.includes(player.id))
    .map((player) => ({
      id: player.id,
      name: player.name,
      status: "active",
      joinedAt: new Date().toISOString(),
      leftAt: null,
      nextRoundOnly: false
    }));

  const sessionState = {
    participants,
    rounds: [],
    currentRoundId: null
  };

  try {
    const { data, error } = await supabaseClient
      .from("sessions")
      .insert({
        played_on:
          document.querySelector("#newSessionDate").value,

        location:
          document
            .querySelector("#newSessionLocation")
            .value
            .trim(),

        team_size: teamSize,
        status: "active",
        state: sessionState
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    state.activeSession = mapSession(data);
    state.sessions.unshift(state.activeSession);

    await createNewRound();

    showToast("Session je pokrenut.", "success");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

/* =========================================================
   ROUND AND TEAM GENERATION
========================================================= */

async function createNewRound() {
  if (!requireAdmin() || !state.activeSession) {
    return;
  }

  const activeParticipants =
    state.activeSession.sessionState.participants.filter(
      (participant) => participant.status === "active"
    );

  const teamSize = state.activeSession.teamSize;

  if (activeParticipants.length < teamSize * 2) {
    showToast(
      "Nema dovoljno aktivnih igrača za novu rundu.",
      "error"
    );

    return;
  }

  activeParticipants.forEach((participant) => {
    participant.nextRoundOnly = false;
  });

  const teams = generateTeams(
    activeParticipants,
    teamSize
  );

  const roundNumber =
    state.activeSession.sessionState.rounds.length + 1;

  const round = {
    id: createId(),
    number: roundNumber,
    status: "active",
    teams,
    matches: [],
    schedule: [],
    createdAt: new Date().toISOString()
  };

  const playingTeams = getPlayingTeams(round);

  if (playingTeams.length >= 4) {
    round.schedule = createFairRoundRobinSchedule(
      playingTeams
    );

    const first = round.schedule[0];

    round.matches.push(
      createPendingMatch(
        first.team1Id,
        first.team2Id,
        1
      )
    );
  } else {
    round.matches.push(createInitialMatch(round));
  }

  state.activeSession.sessionState.rounds.push(round);
  state.activeSession.sessionState.currentRoundId = round.id;

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      `Runda ${roundNumber} je pokrenuta.`,
      "success"
    );
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

function generateTeams(participants, teamSize) {
  const shuffled = shuffleArray([...participants]);
  const teams = [];

  let cursor = 0;
  let teamIndex = 0;

  while (shuffled.length - cursor >= teamSize) {
    teams.push(
      createTeam(
        getTeamLetter(teamIndex),
        shuffled.slice(cursor, cursor + teamSize)
      )
    );

    cursor += teamSize;
    teamIndex += 1;
  }

  const remainder = shuffled.slice(cursor);

  if (remainder.length > 0 && teams.length >= 2) {
    teams.push(
      createTeam(
        getTeamLetter(teamIndex),
        remainder
      )
    );
  } else if (remainder.length > 0) {
    teams.push(
      createTeam("Klupa", remainder, true)
    );
  }

  return teams;
}

function getTeamLetter(index) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  return letters[index] || `T${index + 1}`;
}

function createTeam(label, players, bench = false) {
  return {
    id: createId(),
    label: bench ? "Klupa" : `Tim ${label}`,
    shortLabel: label,
    bench,
    players: players.map(createPlayerSnapshot)
  };
}

function createInitialMatch(round) {
  const teams = getPlayingTeams(round);

  return createPendingMatch(
    teams[0].id,
    teams[1].id,
    1
  );
}

function createPendingMatch(team1Id, team2Id, number) {
  return {
    id: createId(),
    number,
    status: "pending",
    team1Id,
    team2Id,

    team1LineupIds: [],
    team2LineupIds: [],

    team1Players: [],
    team2Players: [],
    loans: [],

    score1: null,
    score2: null,
    winnerTeamId: null,
    loserTeamId: null,

    createdAt: new Date().toISOString()
  };
}

function createFairRoundRobinSchedule(teams) {
  const rotating = teams.map((team) => team.id);

  if (rotating.length % 2 === 1) {
    rotating.push(null);
  }

  const schedule = [];
  const roundCount = rotating.length - 1;
  const half = rotating.length / 2;

  for (
    let roundIndex = 0;
    roundIndex < roundCount;
    roundIndex += 1
  ) {
    for (let index = 0; index < half; index += 1) {
      const team1Id = rotating[index];
      const team2Id =
        rotating[rotating.length - 1 - index];

      if (team1Id && team2Id) {
        schedule.push({
          team1Id,
          team2Id
        });
      }
    }

    rotating.splice(
      1,
      0,
      rotating.pop()
    );
  }

  return schedule;
}

/* =========================================================
   SESSION RENDERING
========================================================= */

function renderActiveSession() {
  const session = state.activeSession;
  const currentRound = getCurrentRound();

  const activeCount =
    session.sessionState.participants.filter(
      (participant) => participant.status === "active"
    ).length;

  const leftCount =
    session.sessionState.participants.length - activeCount;

  let html = `
    <section class="session-hero">
      <div class="card-header">
        <div>
          <h2>🔴 Session uživo</h2>

          <p>
            ${formatDisplayDate(session.date)}
            ${session.location
              ? ` · ${escapeHtml(session.location)}`
              : ""}
          </p>
        </div>

        <span class="status-pill status-live">
          U TIJEKU
        </span>
      </div>

      <div class="session-meta">
        <span>${session.teamSize}v${session.teamSize}</span>
        <span>${activeCount} aktivnih igrača</span>

        <span>
          ${currentRound
            ? `Runda ${currentRound.number}`
            : "Nema aktivne runde"}
        </span>

        ${leftCount
          ? `<span>${leftCount} otišlo</span>`
          : ""}
      </div>
    </section>
  `;

  if (!currentRound) {
    html += `
      <article class="card">
        ${emptyState(
          "🎲",
          "Nema aktivne runde",
          "Admin može pokrenuti novu rundu."
        )}

        ${isAdmin() ? `
          <div class="spacer"></div>

          <button
            class="button button-block"
            id="createRoundButton"
            type="button"
          >
            🎲 Pokreni novu rundu
          </button>
        ` : ""}
      </article>
    `;

    return html;
  }

  html += renderRoundTeams(currentRound);
  html += renderCurrentMatch(currentRound);
  html += renderRoundMatches(currentRound);

  if (isAdmin()) {
    html += renderSessionAdminControls(currentRound);
  }

  return html;
}

function renderRoundTeams(round) {
  const teams = getPlayingTeams(round);
  const bench = round.teams.find((team) => team.bench);
  const activeIds = getActiveParticipantIds();

  return `
    <article class="card">
      <div class="round-header">
        <div>
          <h3>Runda ${round.number} – timovi</h3>

          <div class="player-meta">
            ${round.status === "finished"
              ? "Runda završena"
              : "Runda u tijeku"}
          </div>
        </div>

        <span class="badge">
          ${teams.length} timova
        </span>
      </div>

      <div class="teams-grid">
        ${teams.map((team) => {
          const activePlayers = team.players.filter(
            (player) => activeIds.has(player.id)
          );

          return `
            <section class="team-card">
              <div class="team-header">
                <h3>${escapeHtml(team.label)}</h3>

                <span class="badge">
                  ${activePlayers.length}/${state.activeSession.teamSize}
                </span>
              </div>

              <ul class="team-list">
                ${team.players.map((player) => {
                  const active = activeIds.has(player.id);

                  return `
                    <li class="team-player">
                      <span>${escapeHtml(player.name)}</span>

                      ${active
                        ? ""
                        : `<span class="player-left-tag">OTIŠAO</span>`}
                    </li>
                  `;
                }).join("")}
              </ul>
            </section>
          `;
        }).join("")}
      </div>

      ${bench ? `
        <div class="current-match">
          <strong>Klupa:</strong>

          ${bench.players
            .filter((player) => activeIds.has(player.id))
            .map((player) => escapeHtml(player.name))
            .join(", ") || "Prazna"}
        </div>
      ` : ""}
    </article>
  `;
}

function renderCurrentMatch(round) {
  const match = round.matches.find(
    (item) => item.status === "pending"
  );

  if (!match) {
    return `
      <article class="card">
        ${emptyState(
          "✅",
          "Runda je završena",
          "Admin može pokrenuti novu rundu."
        )}
      </article>
    `;
  }

  const team1 = getTeam(round, match.team1Id);
  const team2 = getTeam(round, match.team2Id);

  if (!team1 || !team2) {
    return `
      <article class="card">
        <div class="alert alert-error visible">
          Utakmica nema ispravno povezane timove.
        </div>
      </article>
    `;
  }

  ensureDefaultLineups(round, match);

  const team1Lineup = getLineupSnapshots(
    round,
    match.team1Id,
    match.team1LineupIds
  );

  const team2Lineup = getLineupSnapshots(
    round,
    match.team2Id,
    match.team2LineupIds
  );

  const teamSize = state.activeSession.teamSize;

  const lineupReady =
    team1Lineup.length === teamSize &&
    team2Lineup.length === teamSize;

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">
            Trenutna utakmica ${match.number}
          </h2>

          <p class="card-subtitle">
            ${lineupReady
              ? "Postave su spremne."
              : "Postava nije potpuna. Admin mora urediti postavu."}
          </p>
        </div>

        <span class="status-pill status-live">
          SLJEDEĆA
        </span>
      </div>

      <div class="current-match">
        <div class="match-versus">
          <div class="match-side">
            <strong>${escapeHtml(team1.label)}</strong>

            ${renderMatchTeamPlayers(team1Lineup)}
          </div>

          <div class="vs">VS</div>

          <div class="match-side">
            <strong>${escapeHtml(team2.label)}</strong>

            ${renderMatchTeamPlayers(team2Lineup)}
          </div>
        </div>

        ${isAdmin() ? `
          <div class="spacer"></div>

          <button
            class="button button-secondary button-block"
            id="editCurrentLineupButton"
            type="button"
            data-round-id="${escapeHtml(round.id)}"
            data-match-id="${escapeHtml(match.id)}"
          >
            ✏️ Uredi postavu
          </button>

          ${!lineupReady ? `
            <div class="lineup-warning">
              Svaki tim mora imati točno ${teamSize} igrača.
            </div>
          ` : ""}

          <div class="score-grid">
            <div class="form-group">
              <label class="form-label" for="currentScore1">
                ${escapeHtml(team1.label)}
              </label>

              <input
                class="input score-input"
                id="currentScore1"
                type="number"
                min="0"
                max="999"
                inputmode="numeric"
              >
            </div>

            <div class="score-divider">:</div>

            <div class="form-group">
              <label class="form-label" for="currentScore2">
                ${escapeHtml(team2.label)}
              </label>

              <input
                class="input score-input"
                id="currentScore2"
                type="number"
                min="0"
                max="999"
                inputmode="numeric"
              >
            </div>
          </div>

          <button
            class="button button-block"
            id="saveCurrentMatchButton"
            type="button"
            data-round-id="${escapeHtml(round.id)}"
            data-match-id="${escapeHtml(match.id)}"
            ${lineupReady ? "" : "disabled"}
          >
            💾 Spremi rezultat i odredi sljedeću utakmicu
          </button>
        ` : ""}
      </div>
    </article>
  `;
}

function renderMatchTeamPlayers(players) {
  if (!players.length) {
    return `
      <span class="player-meta">
        Nema odabranih igrača
      </span>
    `;
  }

  return players.map((player) => `
    <div class="${player.loaned ? "loaned-player" : ""}">
      ${escapeHtml(player.name)}

      ${player.loaned
        ? ` · posuđen iz ${escapeHtml(player.originTeamLabel)}`
        : ""}
    </div>
  `).join("");
}

function renderRoundMatches(round) {
  const matches = round.matches.filter(
    (match) => match.status === "finished"
  );

  if (!matches.length) {
    return "";
  }

  return `
    <article class="card round-card">
      <div class="round-header">
        <h3>Rezultati runde</h3>
        <span class="badge">${matches.length}</span>
      </div>

      ${matches.map((match) => {
        const team1 = getTeam(round, match.team1Id);
        const team2 = getTeam(round, match.team2Id);

        return renderMatchHistoryCard(
          round,
          match,
          team1,
          team2,
          false,
          true
        );
      }).join("")}
    </article>
  `;
}

function renderSessionAdminControls(round) {
  const participants =
    state.activeSession.sessionState.participants;

  const participantIds = new Set(
    participants.map((participant) => participant.id)
  );

  const availablePlayers = state.players.filter(
    (player) =>
      player.active &&
      !participantIds.has(player.id)
  );

  const destinationOptions = [
    ...getPlayingTeams(round).map((team) => `
      <option value="team:${escapeHtml(team.id)}">
        ${escapeHtml(team.label)}
      </option>
    `),

    `<option value="bench">Klupa</option>`,
    `<option value="next-round">Tek od sljedeće runde</option>`
  ].join("");

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Admin upravljanje</h2>

          <p class="card-subtitle">
            Promjene ne mijenjaju već završene utakmice.
          </p>
        </div>
      </div>

      <div class="form-grid">
        <section>
          <div class="form-group">
            <label
              class="form-label"
              for="sessionPlayerStatus"
            >
              Igrač sessiona
            </label>

            <select class="input" id="sessionPlayerStatus">
              <option value="">Odaberi igrača</option>

              ${participants.map((participant) => `
                <option value="${escapeHtml(participant.id)}">
                  ${escapeHtml(participant.name)}
                  ·
                  ${participant.status === "active"
                    ? "aktivan"
                    : "otišao"}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="button-row">
            <button
              class="button button-danger button-small"
              id="markPlayerLeftButton"
              type="button"
            >
              Igrač je otišao
            </button>

            <button
              class="button button-neutral button-small"
              id="returnPlayerButton"
              type="button"
            >
              Vrati igrača
            </button>
          </div>
        </section>

        <section>
          <div class="form-group">
            <label
              class="form-label"
              for="addSessionPlayerSelect"
            >
              Novi igrač
            </label>

            <select class="input" id="addSessionPlayerSelect">
              <option value="">Odaberi igrača</option>

              ${availablePlayers.map((player) => `
                <option value="${escapeHtml(player.id)}">
                  ${escapeHtml(player.name)}
                </option>
              `).join("")}
            </select>
          </div>

          <div class="form-group">
            <label
              class="form-label"
              for="newPlayerDestination"
            >
              Gdje ulazi
            </label>

            <select class="input" id="newPlayerDestination">
              ${destinationOptions}
            </select>
          </div>

          <button
            class="button button-small"
            id="addPlayerToSessionButton"
            type="button"
            ${availablePlayers.length ? "" : "disabled"}
          >
            ＋ Dodaj u session
          </button>
        </section>
      </div>

      <div class="spacer"></div>

      <div class="button-row">
        ${round.status === "finished" ? `
          <button
            class="button"
            id="newRoundButton"
            type="button"
          >
            🎲 Izmiješaj sve i pokreni novu rundu
          </button>
        ` : `
          <button
            class="button button-neutral"
            id="finishRoundButton"
            type="button"
          >
            Završi rundu ranije
          </button>
        `}

        <button
          class="button button-danger"
          id="finishSessionButton"
          type="button"
        >
          🏁 Završi session
        </button>
      </div>
    </article>
  `;
}

/* =========================================================
   LINEUP EDITOR
========================================================= */

function openLineupModal(roundId, matchId) {
  if (!requireAdmin()) {
    return;
  }

  const round = getRound(roundId);

  const match = round?.matches.find(
    (item) => item.id === matchId
  );

  if (!round || !match || match.status !== "pending") {
    return;
  }

  const team1 = getTeam(round, match.team1Id);
  const team2 = getTeam(round, match.team2Id);

  if (!team1 || !team2) {
    showToast(
      "Utakmica nema ispravno povezane timove.",
      "error"
    );

    return;
  }

  ensureDefaultLineups(round, match);

  elements.lineupRoundId.value = round.id;
  elements.lineupMatchId.value = match.id;

  elements.lineupTeam1Title.textContent = team1.label;
  elements.lineupTeam2Title.textContent = team2.label;

  elements.lineupError.textContent = "";
  elements.lineupError.classList.remove("visible");

  const availablePlayers = getActiveRoundPlayers(round);

  elements.lineupTeam1List.innerHTML =
    renderLineupOptions(
      round,
      availablePlayers,
      match.team1LineupIds,
      team1.id,
      team2.id,
      "lineup-team1"
    );

  elements.lineupTeam2List.innerHTML =
    renderLineupOptions(
      round,
      availablePlayers,
      match.team2LineupIds,
      team2.id,
      team1.id,
      "lineup-team2"
    );

  elements.lineupModal.classList.add("visible");
}

function renderLineupOptions(
  round,
  players,
  selectedIds,
  targetTeamId,
  opponentTeamId,
  className
) {
  return players.map((player) => {
    const originTeam = getPlayerOriginTeam(
      round,
      player.id
    );

    const forbidden =
      originTeam?.id === opponentTeamId;

    return `
      <label class="lineup-option">
        <input
          class="${className}"
          type="checkbox"
          value="${escapeHtml(player.id)}"
          ${selectedIds.includes(player.id) ? "checked" : ""}
          ${forbidden ? "disabled" : ""}
        >

        <span>
          <strong>${escapeHtml(player.name)}</strong>

          <span class="lineup-origin">
            ${originTeam
              ? `Osnovni tim: ${escapeHtml(originTeam.label)}`
              : "Novi igrač / bez osnovnog tima"}

            ${originTeam?.id !== targetTeamId && !forbidden
              ? " · posudba"
              : ""}

            ${forbidden
              ? " · ne može igrati protiv svog tima"
              : ""}
          </span>
        </span>
      </label>
    `;
  }).join("");
}

function closeLineupModal() {
  elements.lineupModal.classList.remove("visible");
  elements.lineupError.classList.remove("visible");
}

async function saveLineupFromModal() {
  if (!requireAdmin()) {
    return;
  }

  const round = getRound(
    elements.lineupRoundId.value
  );

  const match = round?.matches.find(
    (item) => item.id === elements.lineupMatchId.value
  );

  if (!round || !match) {
    return;
  }

  const teamSize = state.activeSession.teamSize;

  const team1Ids = [
    ...document.querySelectorAll(".lineup-team1:checked")
  ].map((checkbox) => checkbox.value);

  const team2Ids = [
    ...document.querySelectorAll(".lineup-team2:checked")
  ].map((checkbox) => checkbox.value);

  const duplicates = team1Ids.filter(
    (id) => team2Ids.includes(id)
  );

  if (team1Ids.length !== teamSize) {
    showLineupError(
      `Prvi tim mora imati točno ${teamSize} igrača.`
    );

    return;
  }

  if (team2Ids.length !== teamSize) {
    showLineupError(
      `Drugi tim mora imati točno ${teamSize} igrača.`
    );

    return;
  }

  if (duplicates.length > 0) {
    showLineupError(
      "Isti igrač ne može igrati za oba tima."
    );

    return;
  }

  match.team1LineupIds = team1Ids;
  match.team2LineupIds = team2Ids;

  try {
    await saveActiveSession();

    closeLineupModal();
    safeRenderAll();

    showToast("Postava je spremljena.", "success");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

function showLineupError(message) {
  elements.lineupError.textContent = message;
  elements.lineupError.classList.add("visible");
}

function ensureDefaultLineups(round, match) {
  const teamSize = state.activeSession.teamSize;

  if (!Array.isArray(match.team1LineupIds)) {
    match.team1LineupIds = Array.isArray(match.team1Players)
      ? match.team1Players.map((player) => player.id)
      : [];
  }

  if (!Array.isArray(match.team2LineupIds)) {
    match.team2LineupIds = Array.isArray(match.team2Players)
      ? match.team2Players.map((player) => player.id)
      : [];
  }

  if (
    match.team1LineupIds.length === teamSize &&
    match.team2LineupIds.length === teamSize
  ) {
    return;
  }

  const team1 = getTeam(round, match.team1Id);
  const team2 = getTeam(round, match.team2Id);

  if (!team1 || !team2) {
    return;
  }

  const activeIds = getActiveParticipantIds();

  const team1Ids = team1.players
    .filter((player) => activeIds.has(player.id))
    .map((player) => player.id)
    .slice(0, teamSize);

  const team2Ids = team2.players
    .filter((player) => activeIds.has(player.id))
    .map((player) => player.id)
    .slice(0, teamSize);

  const usedIds = new Set([
    ...team1Ids,
    ...team2Ids
  ]);

  const availablePlayers = getActiveRoundPlayers(round).filter(
    (player) => !usedIds.has(player.id)
  );

  while (
    team1Ids.length < teamSize &&
    availablePlayers.length > 0
  ) {
    const playerIndex = availablePlayers.findIndex(
      (player) => {
        const originTeam = getPlayerOriginTeam(
          round,
          player.id
        );

        return originTeam?.id !== team2.id;
      }
    );

    if (playerIndex < 0) {
      break;
    }

    const [player] = availablePlayers.splice(
      playerIndex,
      1
    );

    team1Ids.push(player.id);
    usedIds.add(player.id);
  }

  while (
    team2Ids.length < teamSize &&
    availablePlayers.length > 0
  ) {
    const playerIndex = availablePlayers.findIndex(
      (player) => {
        const originTeam = getPlayerOriginTeam(
          round,
          player.id
        );

        return originTeam?.id !== team1.id;
      }
    );

    if (playerIndex < 0) {
      break;
    }

    const [player] = availablePlayers.splice(
      playerIndex,
      1
    );

    team2Ids.push(player.id);
    usedIds.add(player.id);
  }

  match.team1LineupIds = team1Ids;
  match.team2LineupIds = team2Ids;
}

function getLineupSnapshots(round, teamId, playerIds) {
  const ids = Array.isArray(playerIds)
    ? playerIds
    : [];

  return ids
    .map((playerId) => {
      const participant =
        state.activeSession.sessionState.participants.find(
          (item) => item.id === playerId
        );

      if (!participant || participant.status !== "active") {
        return null;
      }

      const originTeam = getPlayerOriginTeam(
        round,
        playerId
      );

      return {
        id: participant.id,
        name: participant.name,

        loaned: Boolean(
          originTeam &&
          originTeam.id !== teamId
        ),

        originTeamId: originTeam?.id || null,

        originTeamLabel:
          originTeam?.label || "Novi igrač"
      };
    })
    .filter(Boolean);
}

/* =========================================================
   PLAYER ARRIVAL / DEPARTURE
========================================================= */

async function changeParticipantStatus(status) {
  if (!requireAdmin()) {
    return;
  }

  const playerId =
    document.querySelector("#sessionPlayerStatus")?.value;

  if (!playerId) {
    showToast("Odaberi igrača.", "error");
    return;
  }

  const participant =
    state.activeSession.sessionState.participants.find(
      (item) => item.id === playerId
    );

  if (!participant) {
    return;
  }

  if (
    status === "left" &&
    !window.confirm(
      `${participant.name} odlazi iz sessiona? Promjena vrijedi za buduće utakmice.`
    )
  ) {
    return;
  }

  participant.status = status;

  participant.leftAt =
    status === "left"
      ? new Date().toISOString()
      : null;

  if (status === "active") {
    participant.returnedAt =
      new Date().toISOString();
  }

  const round = getCurrentRound();

  const pendingMatch = round?.matches.find(
    (match) => match.status === "pending"
  );

  if (pendingMatch && status === "left") {
    pendingMatch.team1LineupIds =
      (pendingMatch.team1LineupIds || []).filter(
        (id) => id !== playerId
      );

    pendingMatch.team2LineupIds =
      (pendingMatch.team2LineupIds || []).filter(
        (id) => id !== playerId
      );
  }

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      status === "left"
        ? `${participant.name} je označen kao otišao. Uredi sljedeću postavu.`
        : `${participant.name} je vraćen u session.`,
      "success"
    );
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

async function addPlayerToSession() {
  if (!requireAdmin()) {
    return;
  }

  const playerId =
    document.querySelector("#addSessionPlayerSelect")?.value;

  const destination =
    document.querySelector("#newPlayerDestination")?.value;

  if (!playerId) {
    showToast("Odaberi novog igrača.", "error");
    return;
  }

  const player = state.players.find(
    (item) => item.id === playerId
  );

  if (!player) {
    return;
  }

  const alreadyExists =
    state.activeSession.sessionState.participants.some(
      (participant) => participant.id === player.id
    );

  if (alreadyExists) {
    showToast(
      "Igrač je već u ovom sessionu.",
      "error"
    );

    return;
  }

  const participant = {
    id: player.id,
    name: player.name,
    status: "active",
    joinedAt: new Date().toISOString(),
    leftAt: null,
    nextRoundOnly: destination === "next-round"
  };

  state.activeSession.sessionState.participants.push(
    participant
  );

  const round = getCurrentRound();

  if (
    round &&
    destination?.startsWith("team:")
  ) {
    const teamId = destination.slice(5);
    const team = getTeam(round, teamId);

    if (!team) {
      removeParticipantFromSession(player.id);

      showToast(
        "Odabrani tim ne postoji.",
        "error"
      );

      return;
    }

    const activeIds = getActiveParticipantIds();

    const activeCount = team.players.filter(
      (teamPlayer) =>
        activeIds.has(teamPlayer.id)
    ).length;

    if (activeCount >= state.activeSession.teamSize) {
      removeParticipantFromSession(player.id);

      showToast(
        `${team.label} je već pun. Odaberi klupu ili sljedeću rundu.`,
        "error"
      );

      return;
    }

    team.players.push(
      createPlayerSnapshot(player)
    );
  } else if (
    round &&
    destination === "bench"
  ) {
    let bench = round.teams.find(
      (team) => team.bench
    );

    if (!bench) {
      bench = createTeam("Klupa", [], true);
      round.teams.push(bench);
    }

    bench.players.push(
      createPlayerSnapshot(player)
    );
  }

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      `${player.name} je dodan u session.`,
      "success"
    );
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

function removeParticipantFromSession(playerId) {
  state.activeSession.sessionState.participants =
    state.activeSession.sessionState.participants.filter(
      (participant) => participant.id !== playerId
    );
}

/* =========================================================
   MATCH LOGIC
========================================================= */

async function saveCurrentMatch(roundId, matchId) {
  if (!requireAdmin() || state.saving) {
    return;
  }

  const round = getRound(roundId);

  const match = round?.matches.find(
    (item) => item.id === matchId
  );

  if (
    !round ||
    !match ||
    match.status !== "pending"
  ) {
    return;
  }

  const score1 = parseScore(
    document.querySelector("#currentScore1")?.value
  );

  const score2 = parseScore(
    document.querySelector("#currentScore2")?.value
  );

  if (score1 === null || score2 === null) {
    showToast(
      "Upiši rezultat za oba tima.",
      "error"
    );

    return;
  }

  if (score1 === score2) {
    showToast(
      "Rezultat ne smije biti neriješen.",
      "error"
    );

    return;
  }

  const teamSize = state.activeSession.teamSize;

  const team1Players = getLineupSnapshots(
    round,
    match.team1Id,
    match.team1LineupIds
  );

  const team2Players = getLineupSnapshots(
    round,
    match.team2Id,
    match.team2LineupIds
  );

  if (
    team1Players.length !== teamSize ||
    team2Players.length !== teamSize
  ) {
    showToast(
      `Svaki tim mora imati točno ${teamSize} igrača.`,
      "error"
    );

    return;
  }

  const duplicateIds = team1Players
    .map((player) => player.id)
    .filter((id) =>
      team2Players.some(
        (player) => player.id === id
      )
    );

  if (duplicateIds.length > 0) {
    showToast(
      "Isti igrač ne može igrati za oba tima.",
      "error"
    );

    return;
  }

  match.team1Players = team1Players;
  match.team2Players = team2Players;

  match.loans = [
    ...team1Players
      .filter((player) => player.loaned)
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        fromTeamId: player.originTeamId,
        fromTeamLabel: player.originTeamLabel,
        toTeamId: match.team1Id
      })),

    ...team2Players
      .filter((player) => player.loaned)
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        fromTeamId: player.originTeamId,
        fromTeamLabel: player.originTeamLabel,
        toTeamId: match.team2Id
      }))
  ];

  match.score1 = score1;
  match.score2 = score2;
  match.status = "finished";

  match.winnerTeamId =
    score1 > score2
      ? match.team1Id
      : match.team2Id;

  match.loserTeamId =
    score1 > score2
      ? match.team2Id
      : match.team1Id;

  state.saving = true;

  try {
    createNextMatch(round);
    await saveActiveSession();
    safeRenderAll();

    showToast(
      "Rezultat je spremljen.",
      "success"
    );
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    state.saving = false;
  }
}

function createNextMatch(round) {
  const teams = getPlayingTeams(round);

  const completed = round.matches.filter(
    (match) => match.status === "finished"
  );

  if (teams.length === 2) {
    round.status = "finished";
    return;
  }

  if (teams.length === 3) {
    if (completed.length === 1) {
      const first = completed[0];

      const waitingTeam = teams.find(
        (team) =>
          team.id !== first.team1Id &&
          team.id !== first.team2Id
      );

      if (!waitingTeam) {
        round.status = "finished";
        return;
      }

      round.matches.push(
        createPendingMatch(
          waitingTeam.id,
          first.winnerTeamId,
          2
        )
      );

      return;
    }

    if (completed.length === 2) {
      const first = completed[0];
      const second = completed[1];

      round.matches.push(
        createPendingMatch(
          second.loserTeamId,
          first.loserTeamId,
          3
        )
      );

      return;
    }

    round.status = "finished";
    return;
  }

  if (
    !Array.isArray(round.schedule) ||
    !round.schedule.length
  ) {
    round.schedule =
      createFairRoundRobinSchedule(teams);
  }

  const next = round.schedule[completed.length];

  if (!next) {
    round.status = "finished";
    return;
  }

  round.matches.push(
    createPendingMatch(
      next.team1Id,
      next.team2Id,
      completed.length + 1
    )
  );
}

async function editMatchResult(roundId, matchId) {
  if (!requireAdmin()) {
    return;
  }

  const round = getRound(roundId);

  const matchIndex = round?.matches.findIndex(
    (match) => match.id === matchId
  );

  if (!round || matchIndex < 0) {
    return;
  }

  const match = round.matches[matchIndex];

  const newScore1 = window.prompt(
    "Novi rezultat prvog tima:",
    String(match.score1)
  );

  if (newScore1 === null) {
    return;
  }

  const newScore2 = window.prompt(
    "Novi rezultat drugog tima:",
    String(match.score2)
  );

  if (newScore2 === null) {
    return;
  }

  const score1 = parseScore(newScore1);
  const score2 = parseScore(newScore2);

  if (
    score1 === null ||
    score2 === null ||
    score1 === score2
  ) {
    showToast(
      "Rezultat nije ispravan ili je neriješen.",
      "error"
    );

    return;
  }

  const laterMatchCount =
    round.matches.length - matchIndex - 1;

  if (
    laterMatchCount > 0 &&
    !window.confirm(
      `Promjena može promijeniti kasniji raspored. Bit će uklonjeno ${laterMatchCount} kasnijih utakmica. Nastaviti?`
    )
  ) {
    return;
  }

  match.score1 = score1;
  match.score2 = score2;

  match.winnerTeamId =
    score1 > score2
      ? match.team1Id
      : match.team2Id;

  match.loserTeamId =
    score1 > score2
      ? match.team2Id
      : match.team1Id;

  round.matches = round.matches.slice(
    0,
    matchIndex + 1
  );

  round.status = "active";

  createNextMatch(round);

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      "Rezultat je ispravljen i raspored ponovno izračunat.",
      "success"
    );
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

async function finishRoundEarly() {
  if (!requireAdmin()) {
    return;
  }

  const round = getCurrentRound();

  if (
    !round ||
    !window.confirm("Završiti trenutnu rundu?")
  ) {
    return;
  }

  round.matches = round.matches.filter(
    (match) => match.status === "finished"
  );

  round.status = "finished";

  try {
    await saveActiveSession();
    safeRenderAll();
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

async function finishSession() {
  if (!requireAdmin()) {
    return;
  }

  if (
    !state.activeSession ||
    !window.confirm("Završiti cijeli session?")
  ) {
    return;
  }

  state.activeSession.status = "finished";
  state.saving = true;

  try {
    const { error } = await supabaseClient
      .from("sessions")
      .update({
        status: "finished",
        state: state.activeSession.sessionState
      })
      .eq("id", state.activeSession.id);

    if (error) {
      throw error;
    }

    await loadAllData();
    safeRenderAll();

    showToast(
      "Session je završen.",
      "success"
    );
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    state.saving = false;
  }
}

async function saveActiveSession() {
  if (!state.activeSession) {
    return;
  }

  const previousUpdatedAt =
    state.activeSession.updatedAt;

  let query = supabaseClient
    .from("sessions")
    .update({
      location: state.activeSession.location,
      team_size: state.activeSession.teamSize,
      status: state.activeSession.status,
      state: state.activeSession.sessionState
    })
    .eq("id", state.activeSession.id);

  if (previousUpdatedAt) {
    query = query.eq(
      "updated_at",
      previousUpdatedAt
    );
  }

  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    await loadAllData();
    safeRenderAll();

    throw new Error(
      "Drugi Admin je u međuvremenu promijenio session. Učitani su najnoviji podaci."
    );
  }

  state.activeSession = mapSession(data);

  const index = state.sessions.findIndex(
    (session) =>
      session.id === state.activeSession.id
  );

  if (index >= 0) {
    state.sessions[index] = state.activeSession;
  } else {
    state.sessions.unshift(state.activeSession);
  }
}

/* =========================================================
   GENERAL RENDERING
========================================================= */

function renderAll() {
  renderSession();
  renderPlayers();
  renderHistory();
  renderStats();
  updateRoleInterface();
  bindDynamicEvents();
}

function renderSession() {
  elements.sessionContent.innerHTML =
    state.activeSession
      ? renderActiveSession()
      : renderNoActiveSession();
}

function bindDynamicEvents() {
  bindNoSessionEvents();

  document
    .querySelector("#createRoundButton")
    ?.addEventListener("click", createNewRound);

  document
    .querySelector("#newRoundButton")
    ?.addEventListener("click", createNewRound);

  document
    .querySelector("#finishRoundButton")
    ?.addEventListener("click", finishRoundEarly);

  document
    .querySelector("#finishSessionButton")
    ?.addEventListener("click", finishSession);

  document
    .querySelector("#markPlayerLeftButton")
    ?.addEventListener("click", () => {
      changeParticipantStatus("left");
    });

  document
    .querySelector("#returnPlayerButton")
    ?.addEventListener("click", () => {
      changeParticipantStatus("active");
    });

  document
    .querySelector("#addPlayerToSessionButton")
    ?.addEventListener(
      "click",
      addPlayerToSession
    );

  document
    .querySelector("#editCurrentLineupButton")
    ?.addEventListener("click", (event) => {
      openLineupModal(
        event.currentTarget.dataset.roundId,
        event.currentTarget.dataset.matchId
      );
    });

  document
    .querySelector("#saveCurrentMatchButton")
    ?.addEventListener("click", (event) => {
      saveCurrentMatch(
        event.currentTarget.dataset.roundId,
        event.currentTarget.dataset.matchId
      );
    });

  document
    .querySelectorAll(".edit-result-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        editMatchResult(
          button.dataset.roundId,
          button.dataset.matchId
        );
      });
    });
}

function renderPlayers() {
  const activeCount = state.players.filter(
    (player) => player.active
  ).length;

  elements.playerCountBadge.textContent =
    `${activeCount} aktivnih`;

  if (!state.players.length) {
    elements.managePlayersList.innerHTML = emptyState(
      "👥",
      "Nema igrača",
      "Admin može dodati prvog igrača."
    );

    return;
  }

  elements.managePlayersList.innerHTML =
    state.players.map((player) => `
      <div class="player-row ${player.active ? "" : "inactive"}">
        <span>${player.active ? "🟢" : "⚪"}</span>

        <div>
          <div class="player-name">
            ${escapeHtml(player.name)}
          </div>

          <div class="player-meta">
            ${player.active ? "Aktivan" : "Neaktivan"}
          </div>
        </div>

        ${isAdmin() ? `
          <div class="player-actions">
            <button
              class="button button-neutral button-small button-icon edit-player-button"
              data-player-id="${escapeHtml(player.id)}"
              type="button"
            >
              ✏️
            </button>

            <button
              class="button button-danger button-small button-icon delete-player-button"
              data-player-id="${escapeHtml(player.id)}"
              type="button"
            >
              🗑️
            </button>
          </div>
        ` : ""}
      </div>
    `).join("");

  document
    .querySelectorAll(".edit-player-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        openEditPlayerModal(
          button.dataset.playerId
        );
      });
    });

  document
    .querySelectorAll(".delete-player-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        deletePlayer(
          button.dataset.playerId
        );
      });
    });
}

function renderHistory() {
  elements.historyCountBadge.textContent =
    `${state.sessions.length} sessiona`;

  if (!state.sessions.length) {
    elements.historyList.innerHTML = emptyState(
      "📅",
      "Nema sessiona",
      "Odigrani sessioni pojavit će se ovdje."
    );

    return;
  }

  elements.historyList.innerHTML =
    state.sessions.map((session) => {
      const matches = getAllSessionMatches(session);

      return `
        <section class="history-session">
          <div class="history-session-header">
            <h3>
              ${formatDisplayDate(session.date)}

              ${session.location
                ? ` · ${escapeHtml(session.location)}`
                : ""}
            </h3>

            <div
              class="player-meta"
              style="color: rgba(255,255,255,.86)"
            >
              ${session.teamSize}v${session.teamSize}
              · ${matches.length} utakmica
              · ${session.status === "active"
                ? "u tijeku"
                : "završen"}
            </div>
          </div>

          <div class="history-session-body">
            ${matches.length
              ? matches.map(({ round, match }) => {
                  const team1 = getTeam(
                    round,
                    match.team1Id
                  );

                  const team2 = getTeam(
                    round,
                    match.team2Id
                  );

                  return renderMatchHistoryCard(
                    round,
                    match,
                    team1,
                    team2,
                    true,
                    session.status === "active"
                  );
                }).join("")
              : emptyState(
                  "🏐",
                  "Nema spremljenih utakmica",
                  "Session još nema završenih utakmica."
                )}
          </div>
        </section>
      `;
    }).join("");
}

function renderMatchHistoryCard(
  round,
  match,
  team1,
  team2,
  showRound,
  allowEdit
) {
  const loans = Array.isArray(match.loans)
    ? match.loans
    : match.loan
      ? [match.loan]
      : [];

  return `
    <div class="match-history-item">
      <div class="match-result-line">
        <strong>
          ${showRound
            ? `Runda ${round.number} · `
            : ""}

          ${escapeHtml(team1?.label || "Tim")}
          vs
          ${escapeHtml(team2?.label || "Tim")}
        </strong>

        <span class="match-score">
          ${match.score1} : ${match.score2}
        </span>
      </div>

      <div class="history-lineups">
        ${renderHistoryLineup(
          team1?.label || "Tim 1",
          match.team1Players
        )}

        ${renderHistoryLineup(
          team2?.label || "Tim 2",
          match.team2Players
        )}
      </div>

      ${loans.length ? `
        <div class="history-loan-info">
          ${loans.map((loan) => `
            <div>
              🔄 ${escapeHtml(loan.playerName)}
              posuđen iz
              ${escapeHtml(
                loan.fromTeamLabel ||
                getTeam(
                  round,
                  loan.fromTeamId
                )?.label ||
                "drugog tima"
              )}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${isAdmin() && allowEdit ? `
        <div class="history-actions">
          <button
            class="button button-neutral button-small edit-result-button"
            type="button"
            data-round-id="${escapeHtml(round.id)}"
            data-match-id="${escapeHtml(match.id)}"
          >
            ✏️ Uredi rezultat
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderHistoryLineup(teamLabel, players) {
  const lineup = Array.isArray(players)
    ? players
    : [];

  return `
    <div class="history-lineup">
      <strong>${escapeHtml(teamLabel)}:</strong>

      ${lineup.length
        ? lineup.map((player) => {
            return `
              ${escapeHtml(player.name)}
              ${player.loaned ? "(posuđen)" : ""}
            `;
          }).join(", ")
        : "Postava nije spremljena"}
    </div>
  `;
}

function renderStats() {
  const stats = calculateStats();

  if (!stats.length) {
    elements.statsTableWrapper.innerHTML = emptyState(
      "🏆",
      "Još nema statistike",
      "Statistika će se pojaviti nakon prve utakmice."
    );

    return;
  }

  elements.statsTableWrapper.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Igrač</th>
          <th>Utakmice</th>
          <th>Pobjede</th>
          <th>Porazi</th>
          <th>Posudbe</th>
          <th>Uspješnost</th>
          <th>Bod-razlika</th>
        </tr>
      </thead>

      <tbody>
        ${stats.map((player, index) => `
          <tr>
            <td>${index + 1}</td>

            <td>
              <strong>
                ${escapeHtml(player.name)}
              </strong>
            </td>

            <td>${player.games}</td>
            <td>${player.wins}</td>
            <td>${player.losses}</td>
            <td>${player.loans}</td>
            <td>${player.winRate.toFixed(1)}%</td>

            <td>
              ${formatSignedNumber(
                player.pointDifference
              )}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function calculateStats() {
  const stats = new Map();

  state.sessions.forEach((session) => {
    getAllSessionMatches(session).forEach(({ match }) => {
      applyTeamStats(
        stats,
        match.team1Players,
        match.score1,
        match.score2,
        match.winnerTeamId === match.team1Id
      );

      applyTeamStats(
        stats,
        match.team2Players,
        match.score2,
        match.score1,
        match.winnerTeamId === match.team2Id
      );
    });
  });

  return [...stats.values()]
    .map((player) => ({
      ...player,

      winRate:
        player.games > 0
          ? (player.wins / player.games) * 100
          : 0,

      pointDifference:
        player.pointsFor - player.pointsAgainst
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }

      return (
        b.pointDifference -
        a.pointDifference
      );
    });
}

function applyTeamStats(
  stats,
  players,
  pointsFor,
  pointsAgainst,
  won
) {
  const lineup = Array.isArray(players)
    ? players
    : [];

  lineup.forEach((player) => {
    if (!stats.has(player.id)) {
      stats.set(player.id, {
        id: player.id,
        name: player.name,
        games: 0,
        wins: 0,
        losses: 0,
        loans: 0,
        pointsFor: 0,
        pointsAgainst: 0
      });
    }

    const item = stats.get(player.id);

    item.games += 1;
    item.pointsFor += Number(pointsFor || 0);
    item.pointsAgainst += Number(pointsAgainst || 0);

    if (player.loaned) {
      item.loans += 1;
    }

    if (won) {
      item.wins += 1;
    } else {
      item.losses += 1;
    }
  });
}

/* =========================================================
   HELPERS
========================================================= */

function getCurrentRound() {
  if (!state.activeSession) {
    return null;
  }

  return (
    state.activeSession.sessionState.rounds.find(
      (round) =>
        round.id ===
        state.activeSession.sessionState.currentRoundId
    ) || null
  );
}

function getRound(roundId) {
  return (
    state.activeSession?.sessionState.rounds.find(
      (round) => round.id === roundId
    ) || null
  );
}

function getTeam(round, teamId) {
  return (
    round?.teams.find(
      (team) => team.id === teamId
    ) || null
  );
}

function getPlayingTeams(round) {
  return Array.isArray(round?.teams)
    ? round.teams.filter((team) => !team.bench)
    : [];
}

function getPlayerOriginTeam(round, playerId) {
  return (
    round?.teams.find(
      (team) =>
        team.players.some(
          (player) => player.id === playerId
        )
    ) || null
  );
}

function getActiveParticipantIds() {
  if (!state.activeSession) {
    return new Set();
  }

  return new Set(
    state.activeSession.sessionState.participants
      .filter(
        (participant) =>
          participant.status === "active"
      )
      .map((participant) => participant.id)
  );
}

function getActiveRoundPlayers(round) {
  const activeIds = getActiveParticipantIds();
  const players = new Map();

  round.teams.forEach((team) => {
    team.players.forEach((player) => {
      if (activeIds.has(player.id)) {
        players.set(player.id, {
          id: player.id,
          name: player.name
        });
      }
    });
  });

  state.activeSession.sessionState.participants.forEach(
    (participant) => {
      if (
        participant.status === "active" &&
        !participant.nextRoundOnly
      ) {
        players.set(participant.id, {
          id: participant.id,
          name: participant.name
        });
      }
    }
  );

  return [...players.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "hr")
  );
}

function getAllSessionMatches(session) {
  const result = [];

  session.sessionState.rounds.forEach((round) => {
    round.matches
      .filter(
        (match) => match.status === "finished"
      )
      .forEach((match) => {
        result.push({ round, match });
      });
  });

  return result;
}

async function handleRefresh() {
  setButtonLoading(
    elements.refreshDataButton,
    true,
    "Osvježavanje..."
  );

  try {
    await loadAllData();
    safeRenderAll();

    showToast(
      "Podaci su osvježeni.",
      "success"
    );
  } catch (error) {
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
    application: "Odbojka Špišić Bukovica",
    version: 8,
    exportedAt: new Date().toISOString(),
    players: state.players,
    sessions: state.sessions
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;

  link.download =
    `odbojka-backup-${formatDateForInput(
      new Date()
    )}.json`;

  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function openPage(pageName) {
  Object.entries(elements.pages).forEach(
    ([name, page]) => {
      page.classList.toggle(
        "active",
        name === pageName
      );
    }
  );

  elements.navButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function updateNetworkState() {
  elements.offlineBanner.hidden = navigator.onLine;

  if (!navigator.onLine) {
    setConnectionState("error", "Offline");
  } else {
    setConnectionState("connected");
  }
}

function setConnectionState(type, text = "") {
  elements.connectionDot.classList.remove(
    "connected",
    "error"
  );

  if (type === "connected") {
    elements.connectionDot.classList.add(
      "connected"
    );

    elements.connectionText.textContent =
      text || "Baza povezana";

    return;
  }

  if (type === "error") {
    elements.connectionDot.classList.add(
      "error"
    );

    elements.connectionText.textContent =
      text || "Greška veze";

    return;
  }

  elements.connectionText.textContent =
    text || "Povezivanje...";
}

function showToast(message, type = "") {
  const toast = document.createElement("div");

  toast.className =
    `toast ${type}`.trim();

  toast.textContent = message;

  elements.toastContainer.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3500);
}

function setButtonLoading(button, loading, text) {
  if (!button) {
    return;
  }

  button.disabled = loading;
  button.textContent = text;
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function createPlayerSnapshot(player) {
  return {
    id: player.id,
    name: player.name
  };
}

function shuffleArray(array) {
  for (
    let index = array.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      Math.floor(Math.random() * (index + 1));

    [array[index], array[randomIndex]] = [
      array[randomIndex],
      array[index]
    ];
  }

  return array;
}

function normalizeName(value) {
  const name = String(value)
    .trim()
    .replace(/\s+/g, " ");

  if (!name) {
    return "";
  }

  return (
    name.charAt(0).toLocaleUpperCase("hr") +
    name.slice(1)
  );
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
  if (!dateString) {
    return "Nepoznat datum";
  }

  const [year, month, day] =
    dateString.split("-").map(Number);

  return new Intl.DateTimeFormat("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(
    new Date(year, month - 1, day)
  );
}

function formatSignedNumber(value) {
  return value > 0
    ? `+${value}`
    : String(value);
}

function emptyState(icon, title, description) {
  return `
    <div class="empty-state">
      <span class="empty-state-icon">${icon}</span>
      <strong>${escapeHtml(title)}</strong>
      <div>${escapeHtml(description)}</div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
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
    return (
      "Takav zapis već postoji ili je drugi aktivni session već pokrenut."
    );
  }

  if (error?.code === "42501") {
    return (
      "Nemaš dopuštenje za ovu radnju. Provjeri Admin prijavu i RLS pravila."
    );
  }

  return (
    error?.message ||
    "Dogodila se neočekivana greška."
  );
}
