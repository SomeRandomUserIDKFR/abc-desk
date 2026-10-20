const DEFAULT_PLAYER = {
  name: "Player 1",
  instrument: "violin",
  sourceMode: "shared",
  sourceId: "",
  localSource: "",
  humanization: 0.2,
  timing: 0.15,
  pitch: 0.08,
  volume: 0.85,
  x: 35,
  y: 42,
  podium: "wood-riser",
};

const STORAGE_KEY = "abc-desk-studio-project";

export function initializeStudio({ app, defaultSource, onPreview }) {
  document.body.classList.add("studio-mode");
  const state = loadProject(defaultSource);
  const root = document.createElement("main");
  root.className = "studio-shell";
  root.innerHTML = `
    <section class="studio-toolbar">
      <div>
        <span class="studio-kicker">ABC Desk / Studio</span>
        <h1>Instrumental score manager</h1>
        <p>Arrange players, parts, podiums, and the listening perspective around your score.</p>
      </div>
      <div class="studio-actions">
        <button type="button" data-studio-add-player class="primary">Add player</button>
        <button type="button" data-studio-add-podium>Add podium</button>
        <button type="button" data-studio-add-mic>Add microphone</button>
        <button type="button" data-studio-save>Save project</button>
        <button type="button" data-studio-load>Load project</button>
      </div>
    </section>
    <section class="studio-grid">
      <aside class="panel studio-source-panel">
        <div class="panel-header">
          <h2 class="panel-title">Score and parts</h2>
          <span class="studio-count" data-studio-part-count></span>
        </div>
        <label class="studio-field studio-source-label">
          Main score / V: / Part: source
          <textarea data-studio-main-source spellcheck="false"></textarea>
        </label>
        <div class="studio-source-help">
          Select a player in the room, then assign a shared V: or Part: block.
          Double-click or right-click a player to edit its local ABC.
        </div>
        <div class="studio-parts" data-studio-parts></div>
      </aside>
      <section class="panel studio-room-panel">
        <div class="panel-header">
          <h2 class="panel-title">Room</h2>
          <span class="studio-room-status" data-studio-room-status></span>
        </div>
        <div class="studio-room" data-studio-room aria-label="Studio room layout">
          <div class="studio-room-wall studio-room-wall-top"></div>
          <div class="studio-room-wall studio-room-wall-right"></div>
          <div class="studio-room-wall studio-room-wall-bottom"></div>
          <div class="studio-room-wall studio-room-wall-left"></div>
          <span class="studio-room-label">Chamber room</span>
        </div>
        <div class="studio-room-legend">
          <span><i class="studio-legend-dot player"></i> Player</span>
          <span><i class="studio-legend-dot podium"></i> Podium</span>
          <span><i class="studio-legend-dot conductor"></i> Conductor</span>
          <span><i class="studio-legend-dot mic"></i> Microphone</span>
        </div>
      </section>
      <aside class="panel studio-inspector-panel">
        <div class="panel-header">
          <h2 class="panel-title">Selected object</h2>
          <button type="button" data-studio-delete disabled>Delete</button>
        </div>
        <div data-studio-inspector class="studio-inspector"></div>
      </aside>
    </section>
    <section class="panel studio-preview-panel">
      <div class="panel-header">
        <h2 class="panel-title">Playback preview</h2>
        <div class="toolbar">
          <button type="button" data-studio-preview class="primary">Preview selected player</button>
          <span data-studio-preview-status class="studio-preview-status">Select a player to preview its source.</span>
        </div>
      </div>
      <div class="studio-preview-note">
        This first studio slice uses the existing ABC playback engine for the selected player.
        Room objects and per-player settings are saved in the studio scene and ready for
        independent audio routing.
      </div>
    </section>
  `;
  app.append(root);

  const mainSource = root.querySelector("[data-studio-main-source]");
  const room = root.querySelector("[data-studio-room]");
  const inspector = root.querySelector("[data-studio-inspector]");
  const parts = root.querySelector("[data-studio-parts]");
  const deleteButton = root.querySelector("[data-studio-delete]");
  const partCount = root.querySelector("[data-studio-part-count]");
  const roomStatus = root.querySelector("[data-studio-room-status]");
  const previewStatus = root.querySelector("[data-studio-preview-status]");
  let selected = state.players[0]?.id ?? state.objects[0]?.id ?? null;
  let drag = null;

  mainSource.value = state.mainSource;
  mainSource.addEventListener("input", () => {
    state.mainSource = mainSource.value;
    refreshParts();
    persist();
  });

  root.querySelector("[data-studio-add-player]").addEventListener("click", () => {
    const number = state.players.length + 1;
    const player = {
      ...DEFAULT_PLAYER,
      id: `player-${Date.now()}`,
      name: `Player ${number}`,
      x: 25 + ((number * 17) % 55),
      y: 32 + ((number * 13) % 38),
    };
    state.players.push(player);
    selected = player.id;
    render();
  });
  root.querySelector("[data-studio-add-podium]").addEventListener("click", () => {
    const podium = {
      id: `podium-${Date.now()}`,
      type: "podium",
      name: `Podium ${state.objects.filter((item) => item.type === "podium").length + 1}`,
      material: "wood-riser",
      x: 40,
      y: 48,
    };
    state.objects.push(podium);
    selected = podium.id;
    render();
  });
  root.querySelector("[data-studio-add-mic]").addEventListener("click", () => {
    const microphone = {
      id: `mic-${Date.now()}`,
      type: "microphone",
      name: `Main microphone`,
      pattern: "cardioid",
      x: 58,
      y: 28,
      width: 0.7,
      roomCapture: 0.6,
    };
    state.objects.push(microphone);
    selected = microphone.id;
    render();
  });
  root.querySelector("[data-studio-save]").addEventListener("click", () => {
    persist();
    roomStatus.textContent = "Saved locally";
  });
  root.querySelector("[data-studio-load]").addEventListener("click", () => {
    const loaded = readStoredProject();
    if (!loaded) {
      roomStatus.textContent = "No saved studio project";
      return;
    }
    state.mainSource = loaded.mainSource;
    state.players = loaded.players;
    state.objects = loaded.objects;
    mainSource.value = state.mainSource;
    selected = state.players[0]?.id ?? state.objects[0]?.id ?? null;
    render();
    roomStatus.textContent = "Loaded locally";
  });
  root.querySelector("[data-studio-preview]").addEventListener("click", () => {
    const player = state.players.find((item) => item.id === selected);
    if (!player) {
      previewStatus.textContent = "Select a player first.";
      return;
    }
    const source = sourceForPlayer(state.mainSource, player);
    if (!source.trim()) {
      previewStatus.textContent = "Add ABC source before previewing.";
      return;
    }
    onPreview(source);
    previewStatus.textContent = `Previewing ${player.name} through the existing player.`;
  });
  deleteButton.addEventListener("click", () => {
    if (!selected) return;
    state.players = state.players.filter((item) => item.id !== selected);
    state.objects = state.objects.filter((item) => item.id !== selected);
    selected = state.players[0]?.id ?? state.objects[0]?.id ?? null;
    render();
  });

  function render() {
    renderRoom();
    renderInspector();
    refreshParts();
    persist();
  }

  function renderRoom() {
    room.querySelectorAll(".studio-object").forEach((element) => element.remove());
    const allObjects = [
      ...state.players.map((player) => ({ object: player, type: "player" })),
      ...state.objects,
      { id: "conductor", type: "conductor", name: "Conductor", x: 50, y: 13 },
    ];
    for (const entry of allObjects) {
      const object = entry.object ?? entry;
      const type = entry.type ?? object.type;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `studio-object studio-object-${type}`;
      marker.dataset.objectId = object.id;
      marker.style.left = `${object.x}%`;
      marker.style.top = `${object.y}%`;
      marker.title = `${object.name} — drag to place`;
      marker.innerHTML = `<span class="studio-object-glyph">${glyphFor(type)}</span><span>${escapeHtml(object.name)}</span>`;
      marker.classList.toggle("is-selected", selected === object.id);
      marker.addEventListener("click", () => {
        selected = object.id;
        renderInspector();
        renderRoom();
      });
      marker.addEventListener("dblclick", () => {
        selected = object.id;
        renderInspector();
        const field = inspector.querySelector("[data-studio-local-source]");
        field?.focus();
      });
      marker.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        selected = object.id;
        renderInspector();
        inspector.querySelector("[data-studio-local-source]")?.focus();
      });
      marker.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        marker.setPointerCapture(event.pointerId);
        drag = { object, marker };
      });
      marker.addEventListener("pointermove", (event) => {
        if (!drag || drag.marker !== marker) return;
        const bounds = room.getBoundingClientRect();
        object.x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 5, 95);
        object.y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 8, 92);
        marker.style.left = `${object.x}%`;
        marker.style.top = `${object.y}%`;
        if (selected === object.id) renderInspector();
      });
      marker.addEventListener("pointerup", () => {
        drag = null;
        persist();
      });
      room.append(marker);
    }
    roomStatus.textContent = `${state.players.length} players · ${state.objects.length} room objects`;
  }

  function renderInspector() {
    const player = state.players.find((item) => item.id === selected);
    const object = state.objects.find((item) => item.id === selected);
    deleteButton.disabled = !object && !player;
    if (selected === "conductor") {
      inspector.innerHTML = `
        <div class="studio-empty-selection">
          <strong>Conductor placeholder</strong>
          <p>This marker reserves a future conductor location. It does not produce audio.</p>
        </div>
      `;
      return;
    }
    if (player) {
      const options = parseSourceOptions(state.mainSource);
      inspector.innerHTML = `
        <label class="studio-field">Name<input data-player-field="name" value="${escapeAttribute(player.name)}"></label>
        <label class="studio-field">Instrument<select data-player-field="instrument">
          ${["violin", "viola", "cello", "flute", "clarinet", "piano", "fiddle"].map((name) => `<option ${player.instrument === name ? "selected" : ""}>${name}</option>`).join("")}
        </select></label>
        <label class="studio-field">Source mode<select data-player-field="sourceMode">
          <option value="shared" ${player.sourceMode === "shared" ? "selected" : ""}>Shared score</option>
          <option value="local" ${player.sourceMode === "local" ? "selected" : ""}>Local player ABC</option>
        </select></label>
        ${player.sourceMode === "shared" ? `
          <label class="studio-field">Shared V: / Part:<select data-player-field="sourceId">
            <option value="">Main score</option>
            ${options.map((option) => `<option value="${escapeAttribute(option.id)}" ${player.sourceId === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select></label>
        ` : `
          <label class="studio-field">Local player ABC<textarea data-studio-local-source spellcheck="false">${escapeHtml(player.localSource)}</textarea></label>
        `}
        ${rangeField("Humanization", "humanization", player.humanization, 0, 1, 0.01)}
        ${rangeField("Timing variation", "timing", player.timing, 0, 1, 0.01)}
        ${rangeField("Pitch variation", "pitch", player.pitch, 0, 1, 0.01)}
        ${rangeField("Volume", "volume", player.volume, 0, 1, 0.01)}
        <label class="studio-field">Podium<select data-player-field="podium">
          <option value="">None</option>
          ${state.objects.filter((item) => item.type === "podium").map((item) => `<option value="${item.id}" ${player.podium === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select></label>
      `;
      inspector.querySelectorAll("[data-player-field]").forEach((field) => {
        field.addEventListener("input", () => {
          const key = field.dataset.playerField;
          player[key] = field.type === "range" ? Number(field.value) : field.value;
          renderRoom();
          persist();
        });
      });
      inspector.querySelector("[data-studio-local-source]")?.addEventListener("input", (event) => {
        player.localSource = event.target.value;
        persist();
      });
      inspector.querySelectorAll("[data-studio-range]").forEach((field) => {
        field.addEventListener("input", () => {
          field.nextElementSibling.textContent = Number(field.value).toFixed(2);
        });
      });
      return;
    }
    if (object) {
      if (object.type === "podium") {
        inspector.innerHTML = `
          <label class="studio-field">Name<input data-object-field="name" value="${escapeAttribute(object.name)}"></label>
          <label class="studio-field">Material<select data-object-field="material">
            ${["wood-riser", "carpeted-stage", "stone-platform", "metal-platform"].map((name) => `<option ${object.material === name ? "selected" : ""}>${name}</option>`).join("")}
          </select></label>
          <p class="studio-inspector-note">Podiums currently provide a subtle acoustic scene modifier and a visual placement anchor.</p>
        `;
      } else {
        inspector.innerHTML = `
          <label class="studio-field">Name<input data-object-field="name" value="${escapeAttribute(object.name)}"></label>
          <label class="studio-field">Pattern<select data-object-field="pattern">
            ${["cardioid", "omnidirectional", "figure-eight"].map((name) => `<option ${object.pattern === name ? "selected" : ""}>${name}</option>`).join("")}
          </select></label>
          ${rangeField("Stereo width", "width", object.width, 0, 1, 0.01)}
          ${rangeField("Room capture", "roomCapture", object.roomCapture, 0, 1, 0.01)}
        `;
      }
      inspector.querySelectorAll("[data-object-field]").forEach((field) => {
        field.addEventListener("input", () => {
          object[field.dataset.objectField] = field.value;
          renderRoom();
          persist();
        });
      });
      inspector.querySelectorAll("[data-studio-range]").forEach((field) => {
        field.addEventListener("input", () => {
          object[field.dataset.studioRange] = Number(field.value);
          field.nextElementSibling.textContent = Number(field.value).toFixed(2);
          persist();
        });
      });
      return;
    }
    inspector.innerHTML = `<div class="studio-empty-selection">Select a player or room object.</div>`;
  }

  function refreshParts() {
    const options = parseSourceOptions(state.mainSource);
    partCount.textContent = `${options.length} selectable blocks`;
    parts.innerHTML = options.length
      ? options.map((option) => `<button type="button" class="studio-part-chip" data-part-id="${escapeAttribute(option.id)}">${escapeHtml(option.label)}</button>`).join("")
      : `<span class="studio-empty-selection">No V: or Part: blocks detected. Players can use the main score or local ABC.</span>`;
    parts.querySelectorAll("[data-part-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const player = state.players.find((item) => item.id === selected);
        if (!player) return;
        player.sourceMode = "shared";
        player.sourceId = button.dataset.partId;
        renderInspector();
        persist();
      });
    });
  }

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      mainSource: state.mainSource,
      players: state.players,
      objects: state.objects,
    }));
  }

  render();
}

function loadProject(defaultSource) {
  const saved = readStoredProject();
  if (saved) return saved;
  return {
    mainSource: defaultSource,
    players: [
      { ...DEFAULT_PLAYER, id: "player-1", name: "Violin I", sourceId: "main" },
      { ...DEFAULT_PLAYER, id: "player-2", name: "Violin II", sourceId: "main", x: 55, y: 52, humanization: 0.32, timing: 0.24 },
    ],
    objects: [
      { id: "podium-1", type: "podium", name: "Wood riser", material: "wood-riser", x: 35, y: 49 },
    ],
  };
}

function readStoredProject() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed.mainSource !== "string" || !Array.isArray(parsed.players) || !Array.isArray(parsed.objects)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseSourceOptions(source) {
  const lines = String(source).split(/\r?\n/);
  const options = [];
  let current = null;
  for (const line of lines) {
    const part = line.match(/^\s*Part\s*:\s*(.+?)\s*$/i);
    const voice = line.match(/^\s*V\s*:\s*([^\s]+)(?:\s+name\s*=\s*"?([^"]+)"?)?/i);
    if (part || voice) {
      if (current) options.push(current);
      current = {
        id: part ? `part:${part[1].trim().toLowerCase()}` : `voice:${voice[1].trim().toLowerCase()}`,
        label: part ? `Part: ${part[1].trim()}` : `V: ${voice[1].trim()}${voice[2] ? ` — ${voice[2].trim()}` : ""}`,
      };
    }

    function sourceForPlayer(mainSource, player) {
      if (player.sourceMode === "local" && player.localSource.trim()) {
        return player.localSource;
      }
      if (!player.sourceId || player.sourceId === "main") return mainSource;

      const lines = String(mainSource).split(/\r?\n/);
      const targetIndex = lines.findIndex((line) => {
        const part = line.match(/^\s*Part\s*:\s*(.+?)\s*$/i);
        const voice = line.match(/^\s*V\s*:\s*([^\s]+)/i);
        if (player.sourceId.startsWith("part:")) {
          return part && `part:${part[1].trim().toLowerCase()}` === player.sourceId;
        }
        return voice && `voice:${voice[1].trim().toLowerCase()}` === player.sourceId;
      });
      if (targetIndex < 0) return mainSource;

      const endIndex = lines.findIndex((line, index) => {
        if (index <= targetIndex) return false;
        return /^\s*(?:Part\s*:|V\s*:)/i.test(line);
      });
      const headerEnd = lines.findIndex((line) => /^\s*(?:Part\s*:|V\s*:)/i.test(line));
      const header = headerEnd > 0 ? lines.slice(0, headerEnd) : [];
      const body = lines.slice(targetIndex, endIndex < 0 ? lines.length : endIndex);
      return [...header, ...body].join("\n");
    }
  }
  if (current) options.push(current);
  return options;
}

function rangeField(label, key, value, min, max, step) {
  return `<label class="studio-field studio-range">${label}<span><input type="range" min="${min}" max="${max}" step="${step}" value="${Number(value) || 0}" data-player-field="${key}" data-studio-range="${key}"><output>${Number(value || 0).toFixed(2)}</output></span></label>`;
}

function glyphFor(type) {
  return type === "player" ? "♪" : type === "podium" ? "▰" : type === "microphone" ? "●" : "✦";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
