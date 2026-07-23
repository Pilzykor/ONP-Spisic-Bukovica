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
  if (!elements.sessionContent) {
    return;
  }

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

  elements.loginModal?.addEventListener(
    "click",
    (event) => {
      if (event.target === elements.loginModal) {
        closeLoginModal();
      }
    }
  );

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

  elements.editPlayerModal?.addEventListener(
    "click",
    (event) => {
      if (event.target === elements.editPlayerModal) {
        closeEditPlayerModal();
      }
    }
  );

  elements.cancelLineupButton?.addEventListener(
    "click",
    closeLineupModal
  );

  elements.saveLineupButton?.addEventListener(
    "click",
    saveLineupFromModal
  );

  elements.lineupModal?.addEventListener(
    "click",
    (event) => {
      if (event.target === elements.lineupModal) {
        closeLineupModal();
      }
    }
  );

  elements.refreshDataButton?.addEventListener(
    "click",
    handleRefresh
  );

  elements.exportDataButton?.addEventListener(
    "click",
    exportData
  );

  window.addEventListener(
    "online",
    updateNetworkState
  );

  window.addEventListener(
    "offline",
    updateNetworkState
  );
}

/* =========================================================
   DATA
========================================================= */

async function loadAllData() {
  const [playersResult, sessionsResult] =
    await Promise.all([
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

  state.players = (playersResult.data || []).map(
    mapPlayer
  );

  state.sessions = (sessionsResult.data || []).map(
    mapSession
  );

  state.activeSession =
    state.sessions.find(
      (session) => session.status === "active"
    ) || null;
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
        name:
          participant.name ||
          "Nepoznati igrač",
        status:
          participant.status ||
          "active",
        joinedAt:
          participant.joinedAt ||
          null,
        leftAt:
          participant.leftAt ||
          null,
        returnedAt:
          participant.returnedAt ||
          null,
        nextRoundOnly:
          Boolean(participant.nextRoundOnly)
      }))
    : [];

  const rounds = Array.isArray(source.rounds)
    ? source.rounds.map((round, roundIndex) => {
        const teams = Array.isArray(round.teams)
          ? round.teams
              .filter((team) => !team.bench)
              .map((team, teamIndex) => ({
                id:
                  team.id ||
                  createId(),

                label:
                  team.label ||
                  `Tim ${getTeamLetter(teamIndex)}`,

                shortLabel:
                  team.shortLabel ||
                  getTeamLetter(teamIndex),

                players: Array.isArray(team.players)
                  ? team.players.map((player) => ({
                      id: player.id,
                      name:
                        player.name ||
                        "Nepoznati igrač"
                    }))
                  : []
              }))
          : [];

        const matches = Array.isArray(round.matches)
          ? round.matches.map((match, matchIndex) => {
              const team1Players =
                Array.isArray(match.team1Players)
                  ? match.team1Players
                  : [];

              const team2Players =
                Array.isArray(match.team2Players)
                  ? match.team2Players
                  : [];

              const oldLoans = match.loan
                ? [match.loan]
                : [];

              const normalizedSets =
                normalizeMatchSets(match);

              const matchFormat =
                match.matchFormat === "best-of-three"
                  ? "best-of-three"
                  : normalizedSets.length > 1
                    ? "best-of-three"
                    : "single-set";

              return {
                id:
                  match.id ||
                  createId(),

                number:
                  Number(
                    match.number ||
                    matchIndex + 1
                  ),

                status:
                  match.status ||
                  "pending",

                matchFormat,

                team1Id:
                  match.team1Id ||
                  null,

                team2Id:
                  match.team2Id ||
                  null,

                team1LineupIds:
                  Array.isArray(
                    match.team1LineupIds
                  )
                    ? match.team1LineupIds
                    : team1Players.map(
                        (player) => player.id
                      ),

                team2LineupIds:
                  Array.isArray(
                    match.team2LineupIds
                  )
                    ? match.team2LineupIds
                    : team2Players.map(
                        (player) => player.id
                      ),

                team1Players,
                team2Players,

                loans:
                  Array.isArray(match.loans)
                    ? match.loans
                    : oldLoans,

                sets: normalizedSets,

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

                winnerTeamId:
                  match.winnerTeamId ||
                  null,

                loserTeamId:
                  match.loserTeamId ||
                  null,

                createdAt:
                  match.createdAt ||
                  new Date().toISOString()
              };
            })
          : [];

        return {
          id:
            round.id ||
            createId(),

          number:
            Number(
              round.number ||
              roundIndex + 1
            ),

          status:
            round.status ||
            "active",

          teams,
          matches,

          createdAt:
            round.createdAt ||
            new Date().toISOString()
        };
      })
    : [];

  let currentRoundId =
    source.currentRoundId ||
    null;

  if (
    currentRoundId &&
    !rounds.some(
      (round) => round.id === currentRoundId
    )
  ) {
    currentRoundId = null;
  }

  if (!currentRoundId && rounds.length > 0) {
    currentRoundId =
      rounds[rounds.length - 1].id;
  }

  return {
    participants,
    rounds,
    currentRoundId
  };
}

function normalizeMatchSets(match) {
  if (Array.isArray(match.sets)) {
    return match.sets
      .map((set) => ({
        score1: Number(set.score1),
        score2: Number(set.score2)
      }))
      .filter(
        (set) =>
          Number.isFinite(set.score1) &&
          Number.isFinite(set.score2)
      );
  }

  if (
    match.score1 === null ||
    match.score1 === undefined ||
    match.score2 === null ||
    match.score2 === undefined
  ) {
    return [];
  }

  return [
    {
      score1: Number(match.score1),
      score2: Number(match.score2)
    }
  ];
}

/* =========================================================
   REALTIME
========================================================= */

function subscribeToRealtime() {
  if (state.realtimeChannel) {
    supabaseClient.removeChannel(
      state.realtimeChannel
    );
  }

  state.realtimeChannel = supabaseClient
    .channel("volleyball-manual-matches-v1")
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
  const input = String(value)
    .trim()
    .toLowerCase();

  if (!input) {
    throw new Error(
      "Upiši korisničko ime ili email."
    );
  }

  if (input.includes("@")) {
    return input;
  }

  const username = input.replace(
    /[^a-z0-9._-]/g,
    ""
  );

  if (!username) {
    throw new Error(
      "Neispravno korisničko ime."
    );
  }

  const domain = String(
    config.authEmailDomain || ""
  )
    .trim()
    .replace(/^@+/, "");

  if (!domain) {
    throw new Error(
      "Auth email domena nije postavljena."
    );
  }

  return `${username}@${domain}`;
}

async function handleLogin(event) {
  event.preventDefault();

  elements.loginError.textContent = "";
  elements.loginError.classList.remove(
    "visible"
  );

  setButtonLoading(
    elements.loginButton,
    true,
    "Prijava..."
  );

  try {
    const email = usernameToEmail(
      elements.loginUsername.value
    );

    const password =
      elements.loginPassword.value;

    if (!password) {
      throw new Error(
        "Upiši lozinku."
      );
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
    console.error(
      "Login greška:",
      error
    );

    const original =
      error?.message ||
      "Prijava nije uspjela.";

    let message = original;

    if (
      original
        .toLowerCase()
        .includes(
          "invalid login credentials"
        )
    ) {
      message =
        "Email ili lozinka nisu ispravni.";
    } else if (
      original
        .toLowerCase()
        .includes("email not confirmed")
    ) {
      message =
        "Email nije potvrđen u Supabaseu.";
    }

    elements.loginError.textContent = message;
    elements.loginError.classList.add(
      "visible"
    );
  } finally {
    setButtonLoading(
      elements.loginButton,
      false,
      "Prijavi se"
    );
  }
}

async function handleLogout() {
  const { error } =
    await supabaseClient.auth.signOut({
      scope: "local"
    });

  if (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );

    return;
  }

  state.user = null;

  updateRoleInterface();
  safeRenderAll();

  showToast(
    "Odjavljen si.",
    "success"
  );
}

function openLoginModal() {
  elements.loginModal?.classList.add(
    "visible"
  );

  elements.loginUsername?.focus();
}

function closeLoginModal() {
  elements.loginModal?.classList.remove(
    "visible"
  );

  elements.loginError?.classList.remove(
    "visible"
  );
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

  if (elements.openLoginButton) {
    elements.openLoginButton.hidden = admin;
  }

  if (elements.logoutButton) {
    elements.logoutButton.hidden = !admin;
  }

  elements.roleBanner?.classList.toggle(
    "viewer",
    !admin
  );

  elements.roleBanner?.classList.toggle(
    "admin",
    admin
  );

  if (elements.roleTitle) {
    elements.roleTitle.textContent = admin
      ? "Admin"
      : "Način gledatelja";
  }

  if (elements.roleDescription) {
    elements.roleDescription.textContent =
      admin
        ? "Možeš upravljati igračima, sessionom, rundama i rezultatima."
        : "Možeš gledati session i rezultate, ali ne možeš ništa mijenjati.";
  }

  document
    .querySelectorAll(".admin-only")
    .forEach((element) => {
      element.hidden = !admin;
    });
}

/* =========================================================
   PLAYER MANAGEMENT
========================================================= */

async function handleAddPlayer(event) {
  event.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const name = normalizeName(
    elements.newPlayerName.value
  );

  if (!name) {
    showToast(
      "Upiši ime igrača.",
      "error"
    );

    return;
  }

  setButtonLoading(
    elements.addPlayerButton,
    true,
    "Dodavanje..."
  );

  try {
    const { data, error } =
      await supabaseClient
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

    state.players.push(
      mapPlayer(data)
    );

    sortPlayers();

    elements.newPlayerName.value = "";

    renderPlayers();

    showToast(
      `${name} je dodan.`,
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
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

  elements.editPlayerId.value =
    player.id;

  elements.editPlayerName.value =
    player.name;

  elements.editPlayerActive.value =
    String(player.active);

  elements.editPlayerModal.classList.add(
    "visible"
  );
}

function closeEditPlayerModal() {
  elements.editPlayerModal?.classList.remove(
    "visible"
  );

  elements.editPlayerForm?.reset();
}

async function handleEditPlayer(event) {
  event.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const playerId =
    elements.editPlayerId.value;

  const name = normalizeName(
    elements.editPlayerName.value
  );

  const active =
    elements.editPlayerActive.value ===
    "true";

  if (!name) {
    showToast(
      "Upiši ime igrača.",
      "error"
    );

    return;
  }

  try {
    const { error } =
      await supabaseClient
        .from("players")
        .update({
          name,
          active
        })
        .eq("id", playerId);

    if (error) {
      throw error;
    }

    await loadAllData();

    closeEditPlayerModal();
    safeRenderAll();

    showToast(
      "Igrač je spremljen.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
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
    !window.confirm(
      `Obrisati igrača "${player.name}"?`
    )
  ) {
    return;
  }

  try {
    const { error } =
      await supabaseClient
        .from("players")
        .delete()
        .eq("id", playerId);

    if (error) {
      throw error;
    }

    await loadAllData();
    safeRenderAll();

    showToast(
      "Igrač je obrisan.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

function sortPlayers() {
  state.players.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    return a.name.localeCompare(
      b.name,
      "hr"
    );
  });
}

/* =========================================================
   NEW SESSION
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

  const activePlayers =
    state.players.filter(
      (player) => player.active
    );

  const lastParticipantIds =
    getLastSessionParticipantIds();

  const playerOptions =
    activePlayers
      .map((player) => `
        <label class="player-row">
          <input
            class="player-check session-player-checkbox"
            type="checkbox"
            value="${escapeHtml(player.id)}"
            ${
              lastParticipantIds.has(player.id)
                ? "checked"
                : ""
            }
          >

          <span class="player-name">
            ${escapeHtml(player.name)}
          </span>

          <span class="badge">
            ${
              lastParticipantIds.has(player.id)
                ? "Od zadnjeg puta"
                : "Odaberi"
            }
          </span>
        </label>
      `)
      .join("");

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">
            Pokreni novi session
          </h2>

          <p class="card-subtitle">
            Igrači iz posljednjeg sessiona već su označeni.
            Odklikni one koji danas ne igraju.
          </p>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label
            class="form-label"
            for="newSessionDate"
          >
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
          <label
            class="form-label"
            for="newSessionLocation"
          >
            Lokacija
          </label>

          <input
            class="input"
            id="newSessionLocation"
            type="text"
            maxlength="80"
            value="${escapeHtml(
              config.defaultLocation || ""
            )}"
          >
        </div>
      </div>

      <div class="form-group">
        <span class="form-label">
          Broj igrača u timu
        </span>

        <div class="segmented-control">
          ${[3, 4, 5]
            .map((size) => `
              <div>
                <input
                  class="segment-input session-setup-input"
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
            `)
            .join("")}
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
        ${
          playerOptions ||
          emptyState(
            "👥",
            "Nema aktivnih igrača",
            "Prvo dodaj igrače na kartici Igrači."
          )
        }
      </div>

      <div id="sessionSetupPreview"></div>

      <div class="spacer"></div>

      <button
        class="button button-block"
        id="startSessionButton"
        type="button"
      >
        ▶️ Pokreni session i generiraj timove
      </button>
    </article>
  `;
}

function getLastSessionParticipantIds() {
  const lastSession =
    state.sessions.find(
      (session) =>
        Array.isArray(
          session.sessionState.participants
        ) &&
        session.sessionState.participants.length > 0
    );

  if (!lastSession) {
    return new Set();
  }

  return new Set(
    lastSession.sessionState.participants.map(
      (participant) => participant.id
    )
  );
}

function bindNoSessionEvents() {
  if (!isAdmin()) {
    return;
  }

  document
    .querySelector(
      "#selectAllSessionPlayers"
    )
    ?.addEventListener("click", () => {
      document
        .querySelectorAll(
          ".session-player-checkbox"
        )
        .forEach((checkbox) => {
          checkbox.checked = true;
        });

      updateSessionSetupPreview();
    });

  document
    .querySelector(
      "#clearSessionPlayers"
    )
    ?.addEventListener("click", () => {
      document
        .querySelectorAll(
          ".session-player-checkbox"
        )
        .forEach((checkbox) => {
          checkbox.checked = false;
        });

      updateSessionSetupPreview();
    });

  document
    .querySelectorAll(
      ".session-player-checkbox, input[name='newTeamSize']"
    )
    .forEach((input) => {
      input.addEventListener(
        "change",
        updateSessionSetupPreview
      );
    });

  document
    .querySelector("#startSessionButton")
    ?.addEventListener(
      "click",
      startSession
    );

  updateSessionSetupPreview();
}

function updateSessionSetupPreview() {
  const container =
    document.querySelector(
      "#sessionSetupPreview"
    );

  if (!container) {
    return;
  }

  const playerCount =
    document.querySelectorAll(
      ".session-player-checkbox:checked"
    ).length;

  const teamSize = Number(
    document.querySelector(
      "input[name='newTeamSize']:checked"
    )?.value || 4
  );

  const distribution =
    calculateTeamDistribution(
      playerCount,
      teamSize
    );

  container.innerHTML = `
    <div class="session-meta" style="margin-top: 16px;">
      <span>
        ${playerCount} odabrano
      </span>

      <span>
        ${distribution.length} timova
      </span>

      <span>
        ${
          distribution.length
            ? distribution.join(" + ")
            : "Nedovoljno igrača"
        }
      </span>
    </div>
  `;
}

function calculateTeamDistribution(
  playerCount,
  teamSize
) {
  if (playerCount < teamSize * 2) {
    return [];
  }

  const teamCount = Math.ceil(
    playerCount / teamSize
  );

  const baseSize = Math.floor(
    playerCount / teamCount
  );

  const remainder =
    playerCount % teamCount;

  return Array.from(
    { length: teamCount },
    (_value, index) =>
      baseSize +
      (index < remainder ? 1 : 0)
  );
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
      "input[name='newTeamSize']:checked"
    )?.value || 4
  );

  if (
    selectedIds.length <
    teamSize * 2
  ) {
    showToast(
      `Za ${teamSize}v${teamSize} treba najmanje ${teamSize * 2} igrača.`,
      "error"
    );

    return;
  }

  const selectedPlayers =
    state.players.filter(
      (player) =>
        selectedIds.includes(player.id)
    );

  const participants =
    selectedPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      status: "active",
      joinedAt: new Date().toISOString(),
      leftAt: null,
      returnedAt: null,
      nextRoundOnly: false
    }));

  const teams = generateTeams(
    participants,
    teamSize
  );

  const round = {
    id: createId(),
    number: 1,
    status: "active",
    teams,
    matches: [],
    createdAt: new Date().toISOString()
  };

  const sessionState = {
    participants,
    rounds: [round],
    currentRoundId: round.id
  };

  try {
    const { data, error } =
      await supabaseClient
        .from("sessions")
        .insert({
          played_on:
            document.querySelector(
              "#newSessionDate"
            ).value,

          location:
            document
              .querySelector(
                "#newSessionLocation"
              )
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

    state.activeSession =
      mapSession(data);

    state.sessions.unshift(
      state.activeSession
    );

    safeRenderAll();

    showToast(
      "Session je pokrenut.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

/* =========================================================
   TEAMS AND ROUNDS
========================================================= */

function generateTeams(
  participants,
  teamSize
) {
  const shuffled =
    shuffleArray([...participants]);

  const distribution =
    calculateTeamDistribution(
      shuffled.length,
      teamSize
    );

  const teams = [];
  let cursor = 0;

  distribution.forEach(
    (size, index) => {
      teams.push(
        createTeam(
          getTeamLetter(index),
          shuffled.slice(
            cursor,
            cursor + size
          )
        )
      );

      cursor += size;
    }
  );

  return teams;
}

function createTeam(label, players) {
  return {
    id: createId(),
    label: `Tim ${label}`,
    shortLabel: label,
    players: players.map(
      createPlayerSnapshot
    )
  };
}

function getTeamLetter(index) {
  const letters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  return (
    letters[index] ||
    `T${index + 1}`
  );
}

async function createNewRound() {
  if (
    !requireAdmin() ||
    !state.activeSession
  ) {
    return;
  }

  const activeParticipants =
    state.activeSession
      .sessionState
      .participants
      .filter(
        (participant) =>
          participant.status === "active"
      );

  const teamSize =
    state.activeSession.teamSize;

  if (
    activeParticipants.length <
    teamSize * 2
  ) {
    showToast(
      "Nema dovoljno aktivnih igrača za novu rundu.",
      "error"
    );

    return;
  }

  activeParticipants.forEach(
    (participant) => {
      participant.nextRoundOnly = false;
    }
  );

  const roundNumber =
    state.activeSession
      .sessionState
      .rounds
      .length + 1;

  const round = {
    id: createId(),
    number: roundNumber,
    status: "active",
    teams: generateTeams(
      activeParticipants,
      teamSize
    ),
    matches: [],
    createdAt: new Date().toISOString()
  };

  state.activeSession
    .sessionState
    .rounds
    .push(round);

  state.activeSession
    .sessionState
    .currentRoundId = round.id;

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      `Runda ${roundNumber} je pokrenuta.`,
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

async function shuffleCurrentRound() {
  if (!requireAdmin()) {
    return;
  }

  const round = getCurrentRound();

  if (!round) {
    return;
  }

  const pendingMatch =
    getPendingMatch(round);

  if (pendingMatch) {
    showToast(
      "Prvo završi ili otkaži aktivni meč.",
      "error"
    );

    return;
  }

  const hasFinishedMatches =
    round.matches.some(
      (match) =>
        match.status === "finished"
    );

  if (hasFinishedMatches) {
    showToast(
      "Runda već ima rezultate. Za novi shuffle pokreni novu rundu.",
      "error"
    );

    return;
  }

  const participants =
    state.activeSession
      .sessionState
      .participants
      .filter(
        (participant) =>
          participant.status === "active" &&
          !participant.nextRoundOnly
      );

  round.teams = generateTeams(
    participants,
    state.activeSession.teamSize
  );

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      "Timovi su ponovno promiješani.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

/* =========================================================
   MANUAL MATCH CREATION
========================================================= */

async function createManualMatch() {
  if (!requireAdmin()) {
    return;
  }

  const round = getCurrentRound();

  if (
    !round ||
    round.status !== "active"
  ) {
    showToast(
      "Nema aktivne runde.",
      "error"
    );

    return;
  }

  if (getPendingMatch(round)) {
    showToast(
      "Već postoji aktivan meč.",
      "error"
    );

    return;
  }

  const team1Id =
    document.querySelector(
      "#manualMatchTeam1"
    )?.value;

  const team2Id =
    document.querySelector(
      "#manualMatchTeam2"
    )?.value;

  const matchFormat =
    document.querySelector(
      "input[name='manualMatchFormat']:checked"
    )?.value || "single-set";

  if (!team1Id || !team2Id) {
    showToast(
      "Odaberi obje ekipe.",
      "error"
    );

    return;
  }

  if (team1Id === team2Id) {
    showToast(
      "Ekipa ne može igrati protiv same sebe.",
      "error"
    );

    return;
  }

  const team1 = getTeam(
    round,
    team1Id
  );

  const team2 = getTeam(
    round,
    team2Id
  );

  if (!team1 || !team2) {
    showToast(
      "Odabrani tim ne postoji.",
      "error"
    );

    return;
  }

  const match = {
    id: createId(),
    number:
      round.matches.length + 1,
    status: "pending",
    matchFormat:
      matchFormat === "best-of-three"
        ? "best-of-three"
        : "single-set",

    team1Id,
    team2Id,

    team1LineupIds: [],
    team2LineupIds: [],

    team1Players: [],
    team2Players: [],

    loans: [],
    sets: [],

    score1: null,
    score2: null,

    winnerTeamId: null,
    loserTeamId: null,

    createdAt:
      new Date().toISOString()
  };

  ensureDefaultLineups(
    round,
    match
  );

  round.matches.push(match);

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      `${team1.label} vs ${team2.label} je pokrenut.`,
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

async function cancelPendingMatch() {
  if (!requireAdmin()) {
    return;
  }

  const round = getCurrentRound();
  const match = getPendingMatch(round);

  if (!round || !match) {
    return;
  }

  if (
    !window.confirm(
      "Otkazati trenutni meč? Rezultat neće biti spremljen."
    )
  ) {
    return;
  }

  round.matches =
    round.matches.filter(
      (item) => item.id !== match.id
    );

  renumberRoundMatches(round);

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      "Meč je otkazan.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

function renumberRoundMatches(round) {
  round.matches.forEach(
    (match, index) => {
      match.number = index + 1;
    }
  );
}

/* =========================================================
   SESSION RENDER
========================================================= */

function renderActiveSession() {
  const session =
    state.activeSession;

  const round =
    getCurrentRound();

  const activeCount =
    session.sessionState
      .participants
      .filter(
        (participant) =>
          participant.status === "active"
      )
      .length;

  const leftCount =
    session.sessionState
      .participants
      .length -
    activeCount;

  let html = `
    <section class="session-hero">
      <div class="card-header">
        <div>
          <h2>🔴 Session uživo</h2>

          <p>
            ${formatDisplayDate(session.date)}

            ${
              session.location
                ? ` · ${escapeHtml(
                    session.location
                  )}`
                : ""
            }
          </p>
        </div>

        <span class="status-pill status-live">
          U TIJEKU
        </span>
      </div>

      <div class="session-meta">
        <span>
          ${session.teamSize}v${session.teamSize}
        </span>

        <span>
          ${activeCount} aktivnih igrača
        </span>

        <span>
          ${
            round
              ? `Runda ${round.number}`
              : "Nema aktivne runde"
          }
        </span>

        ${
          leftCount
            ? `<span>${leftCount} otišlo</span>`
            : ""
        }
      </div>
    </section>
  `;

  if (!round) {
    html += `
      <article class="card">
        ${emptyState(
          "🎲",
          "Nema aktivne runde",
          "Admin može pokrenuti novu rundu."
        )}

        ${
          isAdmin()
            ? `
              <div class="spacer"></div>

              <button
                class="button button-block"
                id="createRoundButton"
                type="button"
              >
                🎲 Pokreni novu rundu
              </button>
            `
            : ""
        }
      </article>
    `;

    return html;
  }

  html += renderRoundTeams(round);

  const pendingMatch =
    getPendingMatch(round);

  if (pendingMatch) {
    html += renderCurrentMatch(
      round,
      pendingMatch
    );
  } else if (
    round.status === "active"
  ) {
    html += renderManualMatchCreator(
      round
    );
  } else {
    html += `
      <article class="card">
        ${emptyState(
          "✅",
          "Runda je završena",
          "Admin može pokrenuti novu rundu i ponovno promiješati timove."
        )}
      </article>
    `;
  }

  html += renderRoundMatches(round);

  if (isAdmin()) {
    html += renderSessionAdminControls(
      round
    );
  }

  return html;
}

function renderRoundTeams(round) {
  const teams =
    getPlayingTeams(round);

  const activeIds =
    getActiveParticipantIds();

  const hasFinishedMatches =
    round.matches.some(
      (match) =>
        match.status === "finished"
    );

  const hasPendingMatch =
    Boolean(getPendingMatch(round));

  return `
    <article class="card">
      <div class="round-header">
        <div>
          <h3>
            Runda ${round.number} – timovi
          </h3>

          <div class="player-meta">
            ${
              round.status === "finished"
                ? "Runda završena"
                : "Runda u tijeku"
            }
          </div>
        </div>

        <span class="badge">
          ${teams.length} timova
        </span>
      </div>

      <div class="teams-grid">
        ${teams
          .map((team) => {
            const activePlayers =
              team.players.filter(
                (player) =>
                  activeIds.has(player.id)
              );

            return `
              <section class="team-card">
                <div class="team-header">
                  <h3>
                    ${escapeHtml(team.label)}
                  </h3>

                  <span class="badge">
                    ${activePlayers.length}/${state.activeSession.teamSize}
                  </span>
                </div>

                <ul class="team-list">
                  ${team.players
                    .map((player) => {
                      const active =
                        activeIds.has(
                          player.id
                        );

                      return `
                        <li class="team-player">
                          <span>
                            ${escapeHtml(
                              player.name
                            )}
                          </span>

                          ${
                            active
                              ? ""
                              : `
                                <span class="player-left-tag">
                                  OTIŠAO
                                </span>
                              `
                          }
                        </li>
                      `;
                    })
                    .join("")}
                </ul>
              </section>
            `;
          })
          .join("")}
      </div>

      ${
        isAdmin() &&
        round.status === "active" &&
        !hasFinishedMatches &&
        !hasPendingMatch
          ? `
            <div class="spacer"></div>

            <button
              class="button button-secondary button-block"
              id="shuffleRoundButton"
              type="button"
            >
              🎲 Ponovno promiješaj timove
            </button>
          `
          : ""
      }
    </article>
  `;
}

function renderManualMatchCreator(round) {
  const teams =
    getPlayingTeams(round);

  if (teams.length < 2) {
    return `
      <article class="card">
        <div class="alert alert-error visible">
          Potrebna su najmanje dva tima za meč.
        </div>
      </article>
    `;
  }

  const teamOptions =
    teams
      .map((team) => `
        <option value="${escapeHtml(team.id)}">
          ${escapeHtml(team.label)}
        </option>
      `)
      .join("");

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">
            Napravi sljedeći meč
          </h2>

          <p class="card-subtitle">
            Ručno odaberi format i dvije ekipe.
            Isti par može igrati ponovno.
          </p>
        </div>
      </div>

      ${
        isAdmin()
          ? `
            <div class="form-group">
              <span class="form-label">
                Format meča
              </span>

              <div class="segmented-control">
                <div>
                  <input
                    class="segment-input"
                    id="manualFormatSingle"
                    name="manualMatchFormat"
                    type="radio"
                    value="single-set"
                    checked
                  >

                  <label
                    class="segment-label"
                    for="manualFormatSingle"
                  >
                    1 dobiveni set
                  </label>
                </div>

                <div>
                  <input
                    class="segment-input"
                    id="manualFormatBestOfThree"
                    name="manualMatchFormat"
                    type="radio"
                    value="best-of-three"
                  >

                  <label
                    class="segment-label"
                    for="manualFormatBestOfThree"
                  >
                    2 dobivena seta
                  </label>
                </div>
              </div>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label
                  class="form-label"
                  for="manualMatchTeam1"
                >
                  Prva ekipa
                </label>

                <select
                  class="input"
                  id="manualMatchTeam1"
                >
                  ${teamOptions}
                </select>
              </div>

              <div class="form-group">
                <label
                  class="form-label"
                  for="manualMatchTeam2"
                >
                  Druga ekipa
                </label>

                <select
                  class="input"
                  id="manualMatchTeam2"
                >
                  ${teams
                    .map((team, index) => `
                      <option
                        value="${escapeHtml(team.id)}"
                        ${
                          index === 1
                            ? "selected"
                            : ""
                        }
                      >
                        ${escapeHtml(team.label)}
                      </option>
                    `)
                    .join("")}
                </select>
              </div>
            </div>

            <button
              class="button button-block"
              id="createManualMatchButton"
              type="button"
            >
              ▶️ Pokreni odabrani meč
            </button>
          `
          : emptyState(
              "⏳",
              "Čeka se sljedeći meč",
              "Admin će odabrati ekipe koje igraju."
            )
      }
    </article>
  `;
}

function renderCurrentMatch(
  round,
  match
) {
  const team1 = getTeam(
    round,
    match.team1Id
  );

  const team2 = getTeam(
    round,
    match.team2Id
  );

  if (!team1 || !team2) {
    return `
      <article class="card">
        <div class="alert alert-error visible">
          Meč nema ispravno povezane timove.
        </div>
      </article>
    `;
  }

  ensureDefaultLineups(
    round,
    match
  );

  const team1Lineup =
    getLineupSnapshots(
      round,
      match.team1Id,
      match.team1LineupIds
    );

  const team2Lineup =
    getLineupSnapshots(
      round,
      match.team2Id,
      match.team2LineupIds
    );

  const teamSize =
    state.activeSession.teamSize;

  const lineupReady =
    team1Lineup.length === teamSize &&
    team2Lineup.length === teamSize;

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">
            Meč ${match.number}
          </h2>

          <p class="card-subtitle">
            ${getMatchFormatLabel(
              match.matchFormat
            )}
            ·
            ${
              lineupReady
                ? "Postave su spremne."
                : "Admin mora urediti postavu."
            }
          </p>
        </div>

        <span class="status-pill status-live">
          U TIJEKU
        </span>
      </div>

      <div class="current-match">
        <div class="match-versus">
          <div class="match-side">
            <strong>
              ${escapeHtml(team1.label)}
            </strong>

            ${renderMatchTeamPlayers(
              team1Lineup
            )}
          </div>

          <div class="vs">VS</div>

          <div class="match-side">
            <strong>
              ${escapeHtml(team2.label)}
            </strong>

            ${renderMatchTeamPlayers(
              team2Lineup
            )}
          </div>
        </div>

        ${
          isAdmin()
            ? `
              <div class="spacer"></div>

              <div class="button-row">
                <button
                  class="button button-secondary"
                  id="editCurrentLineupButton"
                  type="button"
                  data-round-id="${escapeHtml(round.id)}"
                  data-match-id="${escapeHtml(match.id)}"
                >
                  ✏️ Uredi postavu
                </button>

                <button
                  class="button button-danger"
                  id="cancelCurrentMatchButton"
                  type="button"
                >
                  Otkaži meč
                </button>
              </div>

              ${
                !lineupReady
                  ? `
                    <div class="lineup-warning">
                      Svaki tim mora imati točno ${teamSize} igrača.
                    </div>
                  `
                  : ""
              }

              ${renderScoreForm(
                match,
                team1,
                team2
              )}

              <button
                class="button button-block"
                id="saveCurrentMatchButton"
                type="button"
                data-round-id="${escapeHtml(round.id)}"
                data-match-id="${escapeHtml(match.id)}"
                ${
                  lineupReady
                    ? ""
                    : "disabled"
                }
              >
                💾 Spremi rezultat
              </button>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function renderScoreForm(
  match,
  team1,
  team2
) {
  if (
    match.matchFormat ===
    "best-of-three"
  ) {
    return `
      ${[1, 2, 3]
        .map((setNumber) => `
          <div class="current-match">
            <strong>
              Set ${setNumber}
              ${
                setNumber === 3
                  ? " · po potrebi"
                  : ""
              }
            </strong>

            <div class="score-grid">
              <div class="form-group">
                <label
                  class="form-label"
                  for="set${setNumber}Score1"
                >
                  ${escapeHtml(team1.label)}
                </label>

                <input
                  class="input score-input set-score-1"
                  id="set${setNumber}Score1"
                  data-set-index="${setNumber - 1}"
                  type="number"
                  min="0"
                  max="999"
                  inputmode="numeric"
                >
              </div>

              <div class="score-divider">:</div>

              <div class="form-group">
                <label
                  class="form-label"
                  for="set${setNumber}Score2"
                >
                  ${escapeHtml(team2.label)}
                </label>

                <input
                  class="input score-input set-score-2"
                  id="set${setNumber}Score2"
                  data-set-index="${setNumber - 1}"
                  type="number"
                  min="0"
                  max="999"
                  inputmode="numeric"
                >
              </div>
            </div>
          </div>
        `)
        .join("")}
    `;
  }

  return `
    <div class="score-grid">
      <div class="form-group">
        <label
          class="form-label"
          for="currentScore1"
        >
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
        <label
          class="form-label"
          for="currentScore2"
        >
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

  return players
    .map((player) => `
      <div class="${
        player.loaned
          ? "loaned-player"
          : ""
      }">
        ${escapeHtml(player.name)}

        ${
          player.loaned
            ? `
              · posuđen iz
              ${escapeHtml(
                player.originTeamLabel
              )}
            `
            : ""
        }
      </div>
    `)
    .join("");
}

function renderRoundMatches(round) {
  const matches =
    round.matches.filter(
      (match) =>
        match.status === "finished"
    );

  if (!matches.length) {
    return "";
  }

  return `
    <article class="card round-card">
      <div class="round-header">
        <h3>Rezultati runde</h3>

        <span class="badge">
          ${matches.length}
        </span>
      </div>

      ${matches
        .map((match) => {
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
            false,
            true
          );
        })
        .join("")}
    </article>
  `;
}

function renderSessionAdminControls(round) {
  const participants =
    state.activeSession
      .sessionState
      .participants;

  const participantIds =
    new Set(
      participants.map(
        (participant) =>
          participant.id
      )
    );

  const availablePlayers =
    state.players.filter(
      (player) =>
        player.active &&
        !participantIds.has(player.id)
    );

  const destinationOptions = [
    ...getPlayingTeams(round)
      .map((team) => `
        <option value="team:${escapeHtml(team.id)}">
          ${escapeHtml(team.label)}
        </option>
      `),

    `
      <option value="next-round">
        Tek od sljedeće runde
      </option>
    `
  ].join("");

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">
            Admin upravljanje
          </h2>

          <p class="card-subtitle">
            Dolasci i odlasci vrijede za buduće spremanje postava.
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

            <select
              class="input"
              id="sessionPlayerStatus"
            >
              <option value="">
                Odaberi igrača
              </option>

              ${participants
                .map((participant) => `
                  <option value="${escapeHtml(participant.id)}">
                    ${escapeHtml(participant.name)}
                    ·
                    ${
                      participant.status === "active"
                        ? participant.nextRoundOnly
                          ? "od sljedeće runde"
                          : "aktivan"
                        : "otišao"
                    }
                  </option>
                `)
                .join("")}
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

            <select
              class="input"
              id="addSessionPlayerSelect"
            >
              <option value="">
                Odaberi igrača
              </option>

              ${availablePlayers
                .map((player) => `
                  <option value="${escapeHtml(player.id)}">
                    ${escapeHtml(player.name)}
                  </option>
                `)
                .join("")}
            </select>
          </div>

          <div class="form-group">
            <label
              class="form-label"
              for="newPlayerDestination"
            >
              Gdje ulazi
            </label>

            <select
              class="input"
              id="newPlayerDestination"
            >
              ${destinationOptions}
            </select>
          </div>

          <button
            class="button button-small"
            id="addPlayerToSessionButton"
            type="button"
            ${
              availablePlayers.length
                ? ""
                : "disabled"
            }
          >
            ＋ Dodaj u session
          </button>
        </section>
      </div>

      <div class="spacer"></div>

      <div class="button-row">
        ${
          round.status === "finished"
            ? `
              <button
                class="button"
                id="newRoundButton"
                type="button"
              >
                🎲 Nova runda i novi shuffle
              </button>
            `
            : `
              <button
                class="button button-neutral"
                id="finishRoundButton"
                type="button"
              >
                Završi rundu
              </button>
            `
        }

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

function openLineupModal(
  roundId,
  matchId
) {
  if (!requireAdmin()) {
    return;
  }

  const round =
    getRound(roundId);

  const match =
    round?.matches.find(
      (item) => item.id === matchId
    );

  if (
    !round ||
    !match ||
    match.status !== "pending"
  ) {
    return;
  }

  const team1 =
    getTeam(
      round,
      match.team1Id
    );

  const team2 =
    getTeam(
      round,
      match.team2Id
    );

  if (!team1 || !team2) {
    showToast(
      "Meč nema ispravno povezane timove.",
      "error"
    );

    return;
  }

  ensureDefaultLineups(
    round,
    match
  );

  elements.lineupRoundId.value =
    round.id;

  elements.lineupMatchId.value =
    match.id;

  elements.lineupTeam1Title.textContent =
    team1.label;

  elements.lineupTeam2Title.textContent =
    team2.label;

  elements.lineupError.textContent = "";

  elements.lineupError.classList.remove(
    "visible"
  );

  const availablePlayers =
    getActiveRoundPlayers(round);

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

  elements.lineupModal.classList.add(
    "visible"
  );
}

function renderLineupOptions(
  round,
  players,
  selectedIds,
  targetTeamId,
  opponentTeamId,
  className
) {
  return players
    .map((player) => {
      const originTeam =
        getPlayerOriginTeam(
          round,
          player.id
        );

      const forbidden =
        originTeam?.id ===
        opponentTeamId;

      const loaned =
        originTeam &&
        originTeam.id !==
          targetTeamId &&
        !forbidden;

      return `
        <label class="lineup-option">
          <input
            class="${className}"
            type="checkbox"
            value="${escapeHtml(player.id)}"
            ${
              selectedIds.includes(
                player.id
              )
                ? "checked"
                : ""
            }
            ${
              forbidden
                ? "disabled"
                : ""
            }
          >

          <span>
            <strong>
              ${escapeHtml(player.name)}
            </strong>

            <span class="lineup-origin">
              ${
                originTeam
                  ? `
                    Osnovni tim:
                    ${escapeHtml(
                      originTeam.label
                    )}
                  `
                  : "Novi igrač"
              }

              ${
                loaned
                  ? " · posudba"
                  : ""
              }

              ${
                forbidden
                  ? " · ne može igrati protiv svog tima"
                  : ""
              }
            </span>
          </span>
        </label>
      `;
    })
    .join("");
}

function closeLineupModal() {
  elements.lineupModal?.classList.remove(
    "visible"
  );

  elements.lineupError?.classList.remove(
    "visible"
  );
}

async function saveLineupFromModal() {
  if (!requireAdmin()) {
    return;
  }

  const round = getRound(
    elements.lineupRoundId.value
  );

  const match =
    round?.matches.find(
      (item) =>
        item.id ===
        elements.lineupMatchId.value
    );

  if (!round || !match) {
    return;
  }

  const teamSize =
    state.activeSession.teamSize;

  const team1Ids = [
    ...document.querySelectorAll(
      ".lineup-team1:checked"
    )
  ].map(
    (checkbox) => checkbox.value
  );

  const team2Ids = [
    ...document.querySelectorAll(
      ".lineup-team2:checked"
    )
  ].map(
    (checkbox) => checkbox.value
  );

  const duplicates =
    team1Ids.filter(
      (id) =>
        team2Ids.includes(id)
    );

  if (
    team1Ids.length !== teamSize
  ) {
    showLineupError(
      `Prvi tim mora imati točno ${teamSize} igrača.`
    );

    return;
  }

  if (
    team2Ids.length !== teamSize
  ) {
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

  match.team1LineupIds =
    team1Ids;

  match.team2LineupIds =
    team2Ids;

  try {
    await saveActiveSession();

    closeLineupModal();
    safeRenderAll();

    showToast(
      "Postava je spremljena.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

function showLineupError(message) {
  elements.lineupError.textContent =
    message;

  elements.lineupError.classList.add(
    "visible"
  );
}

function ensureDefaultLineups(
  round,
  match
) {
  const teamSize =
    state.activeSession.teamSize;

  const activeIds =
    getActiveParticipantIds();

  const team1 =
    getTeam(
      round,
      match.team1Id
    );

  const team2 =
    getTeam(
      round,
      match.team2Id
    );

  if (!team1 || !team2) {
    return;
  }

  const previousTeam1Ids =
    Array.isArray(
      match.team1LineupIds
    )
      ? match.team1LineupIds
      : [];

  const previousTeam2Ids =
    Array.isArray(
      match.team2LineupIds
    )
      ? match.team2LineupIds
      : [];

  const team1Ids =
    previousTeam1Ids
      .filter(
        (id) =>
          activeIds.has(id)
      )
      .slice(0, teamSize);

  const team2Ids =
    previousTeam2Ids
      .filter(
        (id) =>
          activeIds.has(id) &&
          !team1Ids.includes(id)
      )
      .slice(0, teamSize);

  team1.players.forEach(
    (player) => {
      if (
        team1Ids.length < teamSize &&
        activeIds.has(player.id) &&
        !team2Ids.includes(player.id) &&
        !team1Ids.includes(player.id)
      ) {
        team1Ids.push(player.id);
      }
    }
  );

  team2.players.forEach(
    (player) => {
      if (
        team2Ids.length < teamSize &&
        activeIds.has(player.id) &&
        !team1Ids.includes(player.id) &&
        !team2Ids.includes(player.id)
      ) {
        team2Ids.push(player.id);
      }
    }
  );

  const usedIds =
    new Set([
      ...team1Ids,
      ...team2Ids
    ]);

  const availablePlayers =
    getActiveRoundPlayers(round)
      .filter(
        (player) =>
          !usedIds.has(player.id)
      );

  fillLineupFromAvailablePlayers(
    round,
    team1Ids,
    teamSize,
    team2.id,
    availablePlayers
  );

  fillLineupFromAvailablePlayers(
    round,
    team2Ids,
    teamSize,
    team1.id,
    availablePlayers
  );

  match.team1LineupIds =
    team1Ids;

  match.team2LineupIds =
    team2Ids;
}

function fillLineupFromAvailablePlayers(
  round,
  lineupIds,
  teamSize,
  opponentTeamId,
  availablePlayers
) {
  while (
    lineupIds.length < teamSize &&
    availablePlayers.length > 0
  ) {
    const playerIndex =
      availablePlayers.findIndex(
        (player) => {
          const originTeam =
            getPlayerOriginTeam(
              round,
              player.id
            );

          return (
            originTeam?.id !==
            opponentTeamId
          );
        }
      );

    if (playerIndex < 0) {
      break;
    }

    const [player] =
      availablePlayers.splice(
        playerIndex,
        1
      );

    lineupIds.push(player.id);
  }
}

function getLineupSnapshots(
  round,
  teamId,
  playerIds
) {
  const ids =
    Array.isArray(playerIds)
      ? playerIds
      : [];

  return ids
    .map((playerId) => {
      const participant =
        state.activeSession
          .sessionState
          .participants
          .find(
            (item) =>
              item.id === playerId
          );

      if (
        !participant ||
        participant.status !== "active" ||
        participant.nextRoundOnly
      ) {
        return null;
      }

      const originTeam =
        getPlayerOriginTeam(
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

        originTeamId:
          originTeam?.id ||
          null,

        originTeamLabel:
          originTeam?.label ||
          "Novi igrač"
      };
    })
    .filter(Boolean);
}

/* =========================================================
   PLAYER ARRIVAL / DEPARTURE
========================================================= */

async function changeParticipantStatus(
  status
) {
  if (!requireAdmin()) {
    return;
  }

  const playerId =
    document.querySelector(
      "#sessionPlayerStatus"
    )?.value;

  if (!playerId) {
    showToast(
      "Odaberi igrača.",
      "error"
    );

    return;
  }

  const participant =
    state.activeSession
      .sessionState
      .participants
      .find(
        (item) =>
          item.id === playerId
      );

  if (!participant) {
    return;
  }

  if (
    status === "left" &&
    !window.confirm(
      `${participant.name} odlazi iz sessiona?`
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

  const round =
    getCurrentRound();

  const pendingMatch =
    getPendingMatch(round);

  if (
    pendingMatch &&
    status === "left"
  ) {
    pendingMatch.team1LineupIds =
      (
        pendingMatch.team1LineupIds ||
        []
      ).filter(
        (id) => id !== playerId
      );

    pendingMatch.team2LineupIds =
      (
        pendingMatch.team2LineupIds ||
        []
      ).filter(
        (id) => id !== playerId
      );
  }

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      status === "left"
        ? `${participant.name} je označen kao otišao.`
        : `${participant.name} je vraćen u session.`,
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

async function addPlayerToSession() {
  if (!requireAdmin()) {
    return;
  }

  const playerId =
    document.querySelector(
      "#addSessionPlayerSelect"
    )?.value;

  const destination =
    document.querySelector(
      "#newPlayerDestination"
    )?.value;

  if (!playerId) {
    showToast(
      "Odaberi novog igrača.",
      "error"
    );

    return;
  }

  const player =
    state.players.find(
      (item) =>
        item.id === playerId
    );

  if (!player) {
    return;
  }

  const alreadyExists =
    state.activeSession
      .sessionState
      .participants
      .some(
        (participant) =>
          participant.id === player.id
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
    joinedAt:
      new Date().toISOString(),
    leftAt: null,
    returnedAt: null,
    nextRoundOnly:
      destination === "next-round"
  };

  state.activeSession
    .sessionState
    .participants
    .push(participant);

  const round =
    getCurrentRound();

  if (
    round &&
    destination?.startsWith("team:")
  ) {
    const teamId =
      destination.slice(5);

    const team =
      getTeam(
        round,
        teamId
      );

    if (!team) {
      removeParticipantFromSession(
        player.id
      );

      showToast(
        "Odabrani tim ne postoji.",
        "error"
      );

      return;
    }

    const activeCount =
      team.players.filter(
        (teamPlayer) =>
          getActiveParticipantIds()
            .has(teamPlayer.id)
      ).length;

    if (
      activeCount >=
      state.activeSession.teamSize
    ) {
      removeParticipantFromSession(
        player.id
      );

      showToast(
        `${team.label} je već pun. Odaberi sljedeću rundu ili prvo označi nekoga kao otišao.`,
        "error"
      );

      return;
    }

    team.players.push(
      createPlayerSnapshot(player)
    );
  }

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      destination === "next-round"
        ? `${player.name} ulazi od sljedeće runde.`
        : `${player.name} je dodan u session.`,
      "success"
    );
  } catch (error) {
    removeParticipantFromSession(
      player.id
    );

    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

function removeParticipantFromSession(
  playerId
) {
  state.activeSession
    .sessionState
    .participants =
    state.activeSession
      .sessionState
      .participants
      .filter(
        (participant) =>
          participant.id !== playerId
      );
}

/* =========================================================
   SAVE MATCH RESULT
========================================================= */

async function saveCurrentMatch(
  roundId,
  matchId
) {
  if (
    !requireAdmin() ||
    state.saving
  ) {
    return;
  }

  const round =
    getRound(roundId);

  const match =
    round?.matches.find(
      (item) =>
        item.id === matchId
    );

  if (
    !round ||
    !match ||
    match.status !== "pending"
  ) {
    return;
  }

  const teamSize =
    state.activeSession.teamSize;

  const team1Players =
    getLineupSnapshots(
      round,
      match.team1Id,
      match.team1LineupIds
    );

  const team2Players =
    getLineupSnapshots(
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

  const duplicateIds =
    team1Players
      .map((player) => player.id)
      .filter((id) =>
        team2Players.some(
          (player) =>
            player.id === id
        )
      );

  if (duplicateIds.length > 0) {
    showToast(
      "Isti igrač ne može igrati za oba tima.",
      "error"
    );

    return;
  }

  const result =
    readCurrentMatchResult(
      match.matchFormat
    );

  if (!result.valid) {
    showToast(
      result.message,
      "error"
    );

    return;
  }

  match.team1Players =
    team1Players;

  match.team2Players =
    team2Players;

  match.loans = [
    ...team1Players
      .filter(
        (player) => player.loaned
      )
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        fromTeamId:
          player.originTeamId,
        fromTeamLabel:
          player.originTeamLabel,
        toTeamId:
          match.team1Id
      })),

    ...team2Players
      .filter(
        (player) => player.loaned
      )
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        fromTeamId:
          player.originTeamId,
        fromTeamLabel:
          player.originTeamLabel,
        toTeamId:
          match.team2Id
      }))
  ];

  match.sets =
    result.sets;

  match.score1 =
    result.score1;

  match.score2 =
    result.score2;

  match.status =
    "finished";

  match.winnerTeamId =
    result.score1 >
    result.score2
      ? match.team1Id
      : match.team2Id;

  match.loserTeamId =
    result.score1 >
    result.score2
      ? match.team2Id
      : match.team1Id;

  state.saving = true;

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      "Rezultat je spremljen. Odaberi sljedeći meč.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  } finally {
    state.saving = false;
  }
}

function readCurrentMatchResult(
  matchFormat
) {
  if (
    matchFormat !==
    "best-of-three"
  ) {
    const score1 =
      parseScore(
        document.querySelector(
          "#currentScore1"
        )?.value
      );

    const score2 =
      parseScore(
        document.querySelector(
          "#currentScore2"
        )?.value
      );

    if (
      score1 === null ||
      score2 === null
    ) {
      return {
        valid: false,
        message:
          "Upiši rezultat za oba tima."
      };
    }

    if (score1 === score2) {
      return {
        valid: false,
        message:
          "Rezultat ne smije biti neriješen."
      };
    }

    return {
      valid: true,
      sets: [
        {
          score1,
          score2
        }
      ],
      score1,
      score2
    };
  }

  const sets = [];

  for (
    let index = 0;
    index < 3;
    index += 1
  ) {
    const value1 =
      document.querySelector(
        `.set-score-1[data-set-index="${index}"]`
      )?.value ?? "";

    const value2 =
      document.querySelector(
        `.set-score-2[data-set-index="${index}"]`
      )?.value ?? "";

    if (
      value1 === "" &&
      value2 === ""
    ) {
      continue;
    }

    if (
      value1 === "" ||
      value2 === ""
    ) {
      return {
        valid: false,
        message:
          `Upiši oba rezultata za set ${index + 1}.`
      };
    }

    const score1 =
      parseScore(value1);

    const score2 =
      parseScore(value2);

    if (
      score1 === null ||
      score2 === null ||
      score1 === score2
    ) {
      return {
        valid: false,
        message:
          `Set ${index + 1} nije ispravno upisan.`
      };
    }

    sets.push({
      score1,
      score2
    });
  }

  if (
    sets.length < 2 ||
    sets.length > 3
  ) {
    return {
      valid: false,
      message:
        "Za dva dobivena seta treba upisati dva ili tri seta."
    };
  }

  const result =
    calculateSetResult(sets);

  if (
    result.setsWon1 !== 2 &&
    result.setsWon2 !== 2
  ) {
    return {
      valid: false,
      message:
        "Jedan tim mora osvojiti točno dva seta."
    };
  }

  if (
    sets.length === 2 &&
    result.setsWon1 === 1 &&
    result.setsWon2 === 1
  ) {
    return {
      valid: false,
      message:
        "Rezultat je 1:1. Upiši treći set."
    };
  }

  if (
    sets.length === 3 &&
    (
      result.setsWon1 === 3 ||
      result.setsWon2 === 3
    )
  ) {
    return {
      valid: false,
      message:
        "Treći set se igra samo kad je nakon dva seta 1:1."
    };
  }

  return {
    valid: true,
    sets,
    score1:
      result.setsWon1,
    score2:
      result.setsWon2
  };
}

function calculateSetResult(sets) {
  let setsWon1 = 0;
  let setsWon2 = 0;

  sets.forEach((set) => {
    if (
      Number(set.score1) >
      Number(set.score2)
    ) {
      setsWon1 += 1;
    } else {
      setsWon2 += 1;
    }
  });

  return {
    setsWon1,
    setsWon2
  };
}

/* =========================================================
   EDIT RESULT
========================================================= */

async function editMatchResult(
  roundId,
  matchId
) {
  if (!requireAdmin()) {
    return;
  }

  const round =
    getRound(roundId);

  const match =
    round?.matches.find(
      (item) =>
        item.id === matchId
    );

  if (
    !round ||
    !match ||
    match.status !== "finished"
  ) {
    return;
  }

  const result =
    match.matchFormat ===
    "best-of-three"
      ? promptBestOfThreeResult(match)
      : promptSingleSetResult(match);

  if (!result) {
    return;
  }

  match.sets =
    result.sets;

  match.score1 =
    result.score1;

  match.score2 =
    result.score2;

  match.winnerTeamId =
    result.score1 >
    result.score2
      ? match.team1Id
      : match.team2Id;

  match.loserTeamId =
    result.score1 >
    result.score2
      ? match.team2Id
      : match.team1Id;

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      "Rezultat je ispravljen.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

function promptSingleSetResult(match) {
  const value1 =
    window.prompt(
      "Novi rezultat prvog tima:",
      String(match.score1 ?? "")
    );

  if (value1 === null) {
    return null;
  }

  const value2 =
    window.prompt(
      "Novi rezultat drugog tima:",
      String(match.score2 ?? "")
    );

  if (value2 === null) {
    return null;
  }

  const score1 =
    parseScore(value1);

  const score2 =
    parseScore(value2);

  if (
    score1 === null ||
    score2 === null ||
    score1 === score2
  ) {
    showToast(
      "Rezultat nije ispravan ili je neriješen.",
      "error"
    );

    return null;
  }

  return {
    sets: [
      {
        score1,
        score2
      }
    ],
    score1,
    score2
  };
}

function promptBestOfThreeResult(match) {
  const currentSets =
    Array.isArray(match.sets)
      ? match.sets
      : [];

  const sets = [];

  for (
    let index = 0;
    index < 3;
    index += 1
  ) {
    const existing =
      currentSets[index];

    const value1 =
      window.prompt(
        `Set ${index + 1} – prvi tim${
          index === 2
            ? " (ostavi prazno ako nije igran)"
            : ""
        }:`,
        existing
          ? String(existing.score1)
          : ""
      );

    if (value1 === null) {
      return null;
    }

    const value2 =
      window.prompt(
        `Set ${index + 1} – drugi tim${
          index === 2
            ? " (ostavi prazno ako nije igran)"
            : ""
        }:`,
        existing
          ? String(existing.score2)
          : ""
      );

    if (value2 === null) {
      return null;
    }

    if (
      value1 === "" &&
      value2 === ""
    ) {
      continue;
    }

    const score1 =
      parseScore(value1);

    const score2 =
      parseScore(value2);

    if (
      score1 === null ||
      score2 === null ||
      score1 === score2
    ) {
      showToast(
        `Set ${index + 1} nije ispravan.`,
        "error"
      );

      return null;
    }

    sets.push({
      score1,
      score2
    });
  }

  if (
    sets.length < 2 ||
    sets.length > 3
  ) {
    showToast(
      "Upiši dva ili tri seta.",
      "error"
    );

    return null;
  }

  const result =
    calculateSetResult(sets);

  if (
    result.setsWon1 !== 2 &&
    result.setsWon2 !== 2
  ) {
    showToast(
      "Jedan tim mora osvojiti dva seta.",
      "error"
    );

    return null;
  }

  return {
    sets,
    score1:
      result.setsWon1,
    score2:
      result.setsWon2
  };
}

/* =========================================================
   FINISH ROUND / SESSION
========================================================= */

async function finishRound() {
  if (!requireAdmin()) {
    return;
  }

  const round =
    getCurrentRound();

  if (!round) {
    return;
  }

  if (getPendingMatch(round)) {
    showToast(
      "Prvo završi ili otkaži aktivni meč.",
      "error"
    );

    return;
  }

  if (
    !window.confirm(
      "Završiti trenutnu rundu?"
    )
  ) {
    return;
  }

  round.status = "finished";

  try {
    await saveActiveSession();
    safeRenderAll();

    showToast(
      "Runda je završena.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
  }
}

async function finishSession() {
  if (!requireAdmin()) {
    return;
  }

  if (!state.activeSession) {
    return;
  }

  const round =
    getCurrentRound();

  if (
    getPendingMatch(round)
  ) {
    showToast(
      "Prvo završi ili otkaži aktivni meč.",
      "error"
    );

    return;
  }

  if (
    !window.confirm(
      "Završiti cijeli session?"
    )
  ) {
    return;
  }

  state.activeSession.status =
    "finished";

  state.saving = true;

  try {
    const { error } =
      await supabaseClient
        .from("sessions")
        .update({
          status: "finished",
          state:
            state.activeSession.sessionState
        })
        .eq(
          "id",
          state.activeSession.id
        );

    if (error) {
      throw error;
    }

    await loadAllData();
    safeRenderAll();

    showToast(
      "Session je završen. Igrači će biti unaprijed označeni kod sljedećeg sessiona.",
      "success"
    );
  } catch (error) {
    showToast(
      getErrorMessage(error),
      "error"
    );
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

  let query =
    supabaseClient
      .from("sessions")
      .update({
        location:
          state.activeSession.location,

        team_size:
          state.activeSession.teamSize,

        status:
          state.activeSession.status,

        state:
          state.activeSession.sessionState
      })
      .eq(
        "id",
        state.activeSession.id
      );

  if (previousUpdatedAt) {
    query = query.eq(
      "updated_at",
      previousUpdatedAt
    );
  }

  const { data, error } =
    await query
      .select()
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    await loadAllData();
    safeRenderAll();

    throw new Error(
      "Drugi Admin je promijenio session. Učitani su najnoviji podaci."
    );
  }

  state.activeSession =
    mapSession(data);

  const index =
    state.sessions.findIndex(
      (session) =>
        session.id ===
        state.activeSession.id
    );

  if (index >= 0) {
    state.sessions[index] =
      state.activeSession;
  } else {
    state.sessions.unshift(
      state.activeSession
    );
  }
}

/* =========================================================
   GENERAL RENDER
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
  if (!elements.sessionContent) {
    return;
  }

  elements.sessionContent.innerHTML =
    state.activeSession
      ? renderActiveSession()
      : renderNoActiveSession();
}

function bindDynamicEvents() {
  bindNoSessionEvents();

  document
    .querySelector(
      "#createRoundButton"
    )
    ?.addEventListener(
      "click",
      createNewRound
    );

  document
    .querySelector(
      "#newRoundButton"
    )
    ?.addEventListener(
      "click",
      createNewRound
    );

  document
    .querySelector(
      "#shuffleRoundButton"
    )
    ?.addEventListener(
      "click",
      shuffleCurrentRound
    );

  document
    .querySelector(
      "#createManualMatchButton"
    )
    ?.addEventListener(
      "click",
      createManualMatch
    );

  document
    .querySelector(
      "#cancelCurrentMatchButton"
    )
    ?.addEventListener(
      "click",
      cancelPendingMatch
    );

  document
    .querySelector(
      "#finishRoundButton"
    )
    ?.addEventListener(
      "click",
      finishRound
    );

  document
    .querySelector(
      "#finishSessionButton"
    )
    ?.addEventListener(
      "click",
      finishSession
    );

  document
    .querySelector(
      "#markPlayerLeftButton"
    )
    ?.addEventListener(
      "click",
      () => {
        changeParticipantStatus(
          "left"
        );
      }
    );

  document
    .querySelector(
      "#returnPlayerButton"
    )
    ?.addEventListener(
      "click",
      () => {
        changeParticipantStatus(
          "active"
        );
      }
    );

  document
    .querySelector(
      "#addPlayerToSessionButton"
    )
    ?.addEventListener(
      "click",
      addPlayerToSession
    );

  document
    .querySelector(
      "#editCurrentLineupButton"
    )
    ?.addEventListener(
      "click",
      (event) => {
        openLineupModal(
          event.currentTarget.dataset.roundId,
          event.currentTarget.dataset.matchId
        );
      }
    );

  document
    .querySelector(
      "#saveCurrentMatchButton"
    )
    ?.addEventListener(
      "click",
      (event) => {
        saveCurrentMatch(
          event.currentTarget.dataset.roundId,
          event.currentTarget.dataset.matchId
        );
      }
    );

  document
    .querySelectorAll(
      ".edit-result-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          editMatchResult(
            button.dataset.roundId,
            button.dataset.matchId
          );
        }
      );
    });
}

function renderPlayers() {
  const activeCount =
    state.players.filter(
      (player) => player.active
    ).length;

  if (elements.playerCountBadge) {
    elements.playerCountBadge.textContent =
      `${activeCount} aktivnih`;
  }

  if (!elements.managePlayersList) {
    return;
  }

  if (!state.players.length) {
    elements.managePlayersList.innerHTML =
      emptyState(
        "👥",
        "Nema igrača",
        "Admin može dodati prvog igrača."
      );

    return;
  }

  elements.managePlayersList.innerHTML =
    state.players
      .map((player) => `
        <div class="player-row ${
          player.active
            ? ""
            : "inactive"
        }">
          <span>
            ${
              player.active
                ? "🟢"
                : "⚪"
            }
          </span>

          <div>
            <div class="player-name">
              ${escapeHtml(player.name)}
            </div>

            <div class="player-meta">
              ${
                player.active
                  ? "Aktivan"
                  : "Neaktivan"
              }
            </div>
          </div>

          ${
            isAdmin()
              ? `
                <div class="player-actions">
                  <button
                    class="button button-neutral button-small button-icon edit-player-button"
                    data-player-id="${escapeHtml(player.id)}"
                    type="button"
                    aria-label="Uredi igrača"
                  >
                    ✏️
                  </button>

                  <button
                    class="button button-danger button-small button-icon delete-player-button"
                    data-player-id="${escapeHtml(player.id)}"
                    type="button"
                    aria-label="Obriši igrača"
                  >
                    🗑️
                  </button>
                </div>
              `
              : ""
          }
        </div>
      `)
      .join("");

  document
    .querySelectorAll(
      ".edit-player-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          openEditPlayerModal(
            button.dataset.playerId
          );
        }
      );
    });

  document
    .querySelectorAll(
      ".delete-player-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          deletePlayer(
            button.dataset.playerId
          );
        }
      );
    });
}

function renderHistory() {
  if (elements.historyCountBadge) {
    elements.historyCountBadge.textContent =
      `${state.sessions.length} sessiona`;
  }

  if (!elements.historyList) {
    return;
  }

  if (!state.sessions.length) {
    elements.historyList.innerHTML =
      emptyState(
        "📅",
        "Nema sessiona",
        "Odigrani sessioni pojavit će se ovdje."
      );

    return;
  }

  elements.historyList.innerHTML =
    state.sessions
      .map((session) => {
        const matches =
          getAllSessionMatches(
            session
          );

        return `
          <section class="history-session">
            <div class="history-session-header">
              <h3>
                ${formatDisplayDate(session.date)}

                ${
                  session.location
                    ? ` · ${escapeHtml(session.location)}`
                    : ""
                }
              </h3>

              <div
                class="player-meta"
                style="color: rgba(255,255,255,.86)"
              >
                ${session.teamSize}v${session.teamSize}
                · ${matches.length} utakmica
                · ${
                  session.status === "active"
                    ? "u tijeku"
                    : "završen"
                }
              </div>
            </div>

            <div class="history-session-body">
              ${
                matches.length
                  ? matches
                      .map(
                        ({
                          round,
                          match
                        }) => {
                          const team1 =
                            getTeam(
                              round,
                              match.team1Id
                            );

                          const team2 =
                            getTeam(
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
                        }
                      )
                      .join("")
                  : emptyState(
                      "🏐",
                      "Nema spremljenih utakmica",
                      "Session još nema završenih utakmica."
                    )
              }
            </div>
          </section>
        `;
      })
      .join("");
}

function renderMatchHistoryCard(
  round,
  match,
  team1,
  team2,
  showRound,
  allowEdit
) {
  const loans =
    Array.isArray(match.loans)
      ? match.loans
      : [];

  return `
    <div class="match-history-item">
      <div class="match-result-line">
        <strong>
          ${
            showRound
              ? `Runda ${round.number} · `
              : ""
          }

          ${escapeHtml(
            team1?.label || "Tim"
          )}
          vs
          ${escapeHtml(
            team2?.label || "Tim"
          )}
        </strong>

        <span class="match-score">
          ${match.score1} : ${match.score2}
        </span>
      </div>

      <div class="player-meta">
        ${getMatchFormatLabel(
          match.matchFormat
        )}
      </div>

      ${
        Array.isArray(match.sets) &&
        match.sets.length > 1
          ? `
            <div class="player-meta">
              ${match.sets
                .map(
                  (set, index) =>
                    `Set ${index + 1}: ${set.score1}:${set.score2}`
                )
                .join(" · ")}
            </div>
          `
          : ""
      }

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

      ${
        loans.length
          ? `
            <div class="history-loan-info">
              ${loans
                .map((loan) => `
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
                `)
                .join("")}
            </div>
          `
          : ""
      }

      ${
        isAdmin() &&
        allowEdit
          ? `
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
          `
          : ""
      }
    </div>
  `;
}

function renderHistoryLineup(
  teamLabel,
  players
) {
  const lineup =
    Array.isArray(players)
      ? players
      : [];

  return `
    <div class="history-lineup">
      <strong>
        ${escapeHtml(teamLabel)}:
      </strong>

      ${
        lineup.length
          ? lineup
              .map(
                (player) => `
                  ${escapeHtml(player.name)}
                  ${
                    player.loaned
                      ? "(posuđen)"
                      : ""
                  }
                `
              )
              .join(", ")
          : "Postava nije spremljena"
      }
    </div>
  `;
}

/* =========================================================
   STATS
========================================================= */

function renderStats() {
  if (!elements.statsTableWrapper) {
    return;
  }

  const stats =
    calculateStats();

  if (!stats.length) {
    elements.statsTableWrapper.innerHTML =
      emptyState(
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
          <th>Setovi</th>
          <th>Uspješnost</th>
          <th>Bod-razlika</th>
        </tr>
      </thead>

      <tbody>
        ${stats
          .map(
            (player, index) => `
              <tr>
                <td>
                  ${index + 1}
                </td>

                <td>
                  <strong>
                    ${escapeHtml(player.name)}
                  </strong>
                </td>

                <td>
                  ${player.games}
                </td>

                <td>
                  ${player.wins}
                </td>

                <td>
                  ${player.losses}
                </td>

                <td>
                  ${player.loans}
                </td>

                <td>
                  ${player.setsWon}:${player.setsLost}
                </td>

                <td>
                  ${player.winRate.toFixed(1)}%
                </td>

                <td>
                  ${formatSignedNumber(
                    player.pointDifference
                  )}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function calculateStats() {
  const stats =
    new Map();

  state.sessions.forEach(
    (session) => {
      getAllSessionMatches(
        session
      ).forEach(({ match }) => {
        const sets =
          Array.isArray(match.sets) &&
          match.sets.length
            ? match.sets
            : [
                {
                  score1:
                    Number(
                      match.score1 || 0
                    ),
                  score2:
                    Number(
                      match.score2 || 0
                    )
                }
              ];

        const setResult =
          calculateSetResult(sets);

        const team1Points =
          sets.reduce(
            (sum, set) =>
              sum +
              Number(set.score1 || 0),
            0
          );

        const team2Points =
          sets.reduce(
            (sum, set) =>
              sum +
              Number(set.score2 || 0),
            0
          );

        applyTeamStats(
          stats,
          match.team1Players,
          setResult.setsWon1,
          setResult.setsWon2,
          team1Points,
          team2Points,
          match.winnerTeamId ===
            match.team1Id
        );

        applyTeamStats(
          stats,
          match.team2Players,
          setResult.setsWon2,
          setResult.setsWon1,
          team2Points,
          team1Points,
          match.winnerTeamId ===
            match.team2Id
        );
      });
    }
  );

  return [...stats.values()]
    .map((player) => ({
      ...player,

      winRate:
        player.games > 0
          ? (
              player.wins /
              player.games
            ) * 100
          : 0,

      pointDifference:
        player.pointsFor -
        player.pointsAgainst
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      if (
        b.winRate !==
        a.winRate
      ) {
        return (
          b.winRate -
          a.winRate
        );
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
  setsWon,
  setsLost,
  pointsFor,
  pointsAgainst,
  won
) {
  const lineup =
    Array.isArray(players)
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
        setsWon: 0,
        setsLost: 0,
        pointsFor: 0,
        pointsAgainst: 0
      });
    }

    const item =
      stats.get(player.id);

    item.games += 1;

    item.setsWon +=
      Number(setsWon || 0);

    item.setsLost +=
      Number(setsLost || 0);

    item.pointsFor +=
      Number(pointsFor || 0);

    item.pointsAgainst +=
      Number(pointsAgainst || 0);

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
    state.activeSession
      .sessionState
      .rounds
      .find(
        (round) =>
          round.id ===
          state.activeSession
            .sessionState
            .currentRoundId
      ) || null
  );
}

function getRound(roundId) {
  return (
    state.activeSession
      ?.sessionState
      .rounds
      .find(
        (round) =>
          round.id === roundId
      ) || null
  );
}

function getTeam(
  round,
  teamId
) {
  return (
    round?.teams.find(
      (team) =>
        team.id === teamId
    ) || null
  );
}

function getPlayingTeams(round) {
  return Array.isArray(round?.teams)
    ? round.teams
    : [];
}

function getPendingMatch(round) {
  return (
    round?.matches.find(
      (match) =>
        match.status === "pending"
    ) || null
  );
}

function getPlayerOriginTeam(
  round,
  playerId
) {
  return (
    round?.teams.find(
      (team) =>
        team.players.some(
          (player) =>
            player.id === playerId
        )
    ) || null
  );
}

function getActiveParticipantIds() {
  if (!state.activeSession) {
    return new Set();
  }

  return new Set(
    state.activeSession
      .sessionState
      .participants
      .filter(
        (participant) =>
          participant.status === "active" &&
          !participant.nextRoundOnly
      )
      .map(
        (participant) =>
          participant.id
      )
  );
}

function getActiveRoundPlayers(round) {
  const activeIds =
    getActiveParticipantIds();

  const players =
    new Map();

  round.teams.forEach((team) => {
    team.players.forEach(
      (player) => {
        if (
          activeIds.has(player.id)
        ) {
          players.set(
            player.id,
            {
              id: player.id,
              name: player.name
            }
          );
        }
      }
    );
  });

  state.activeSession
    .sessionState
    .participants
    .forEach((participant) => {
      if (
        participant.status === "active" &&
        !participant.nextRoundOnly
      ) {
        players.set(
          participant.id,
          {
            id: participant.id,
            name: participant.name
          }
        );
      }
    });

  return [...players.values()]
    .sort((a, b) =>
      a.name.localeCompare(
        b.name,
        "hr"
      )
    );
}

function getAllSessionMatches(session) {
  const result = [];

  session.sessionState
    .rounds
    .forEach((round) => {
      round.matches
        .filter(
          (match) =>
            match.status === "finished"
        )
        .forEach((match) => {
          result.push({
            round,
            match
          });
        });
    });

  return result;
}

function getMatchFormatLabel(format) {
  return (
    format === "best-of-three"
      ? "2 dobivena seta"
      : "1 dobiveni set"
  );
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
    showToast(
      getErrorMessage(error),
      "error"
    );
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
    application:
      "Odbojka Špišić Bukovica",

    version: 11,

    exportedAt:
      new Date().toISOString(),

    players:
      state.players,

    sessions:
      state.sessions
  };

  const blob =
    new Blob(
      [
        JSON.stringify(
          payload,
          null,
          2
        )
      ],
      {
        type: "application/json"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

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
  Object.entries(
    elements.pages
  ).forEach(
    ([name, page]) => {
      page?.classList.toggle(
        "active",
        name === pageName
      );
    }
  );

  elements.navButtons.forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.page ===
          pageName
      );
    }
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function updateNetworkState() {
  if (elements.offlineBanner) {
    elements.offlineBanner.hidden =
      navigator.onLine;
  }

  if (!navigator.onLine) {
    setConnectionState(
      "error",
      "Offline"
    );
  } else {
    setConnectionState(
      "connected"
    );
  }
}

function setConnectionState(
  type,
  text = ""
) {
  elements.connectionDot?.classList.remove(
    "connected",
    "error"
  );

  if (type === "connected") {
    elements.connectionDot?.classList.add(
      "connected"
    );

    if (elements.connectionText) {
      elements.connectionText.textContent =
        text || "Baza povezana";
    }

    return;
  }

  if (type === "error") {
    elements.connectionDot?.classList.add(
      "error"
    );

    if (elements.connectionText) {
      elements.connectionText.textContent =
        text || "Greška veze";
    }

    return;
  }

  if (elements.connectionText) {
    elements.connectionText.textContent =
      text || "Povezivanje...";
  }
}

function showToast(
  message,
  type = ""
) {
  if (!elements.toastContainer) {
    console.log(message);
    return;
  }

  const toast =
    document.createElement("div");

  toast.className =
    `toast ${type}`.trim();

  toast.textContent =
    message;

  elements.toastContainer.append(
    toast
  );

  window.setTimeout(() => {
    toast.remove();
  }, 3500);
}

function setButtonLoading(
  button,
  loading,
  text
) {
  if (!button) {
    return;
  }

  button.disabled =
    loading;

  button.textContent =
    text;
}

function createId() {
  if (
    window.crypto?.randomUUID
  ) {
    return (
      window.crypto.randomUUID()
    );
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
    let index =
      array.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      Math.floor(
        Math.random() *
        (index + 1)
      );

    [
      array[index],
      array[randomIndex]
    ] = [
      array[randomIndex],
      array[index]
    ];
  }

  return array;
}

function normalizeName(value) {
  const name =
    String(value)
      .trim()
      .replace(/\s+/g, " ");

  if (!name) {
    return "";
  }

  return (
    name
      .charAt(0)
      .toLocaleUpperCase("hr") +
    name.slice(1)
  );
}

function parseScore(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const score =
    Number(value);

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
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateString) {
  if (!dateString) {
    return "Nepoznat datum";
  }

  const [year, month, day] =
    dateString
      .split("-")
      .map(Number);

  return new Intl.DateTimeFormat(
    "hr-HR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  ).format(
    new Date(
      year,
      month - 1,
      day
    )
  );
}

function formatSignedNumber(value) {
  return value > 0
    ? `+${value}`
    : String(value);
}

function emptyState(
  icon,
  title,
  description
) {
  return `
    <div class="empty-state">
      <span class="empty-state-icon">
        ${icon}
      </span>

      <strong>
        ${escapeHtml(title)}
      </strong>

      <div>
        ${escapeHtml(description)}
      </div>
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
