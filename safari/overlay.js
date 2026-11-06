(() => {
  const Col = window.ContadorCollector;
  const C = window.ContadorContest;
  if (!Col || !C) {
    alert("Não consegui carregar o contador. Abra de novo o botão dos Favoritos.");
    return;
  }

  const shortcode = Col.shortcodeFromLocation();
  if (!shortcode) {
    alert("Abra o post ou o reel no Instagram e clique de novo em Contar votos.");
    return;
  }

  const KEY = "contador.votos.djs";

  function loadDjs() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(saved) && saved.length) {
        return saved.map(C.normalizarHandle).filter(Boolean);
      }
    } catch (_) {}
    return [...C.DJS_PADRAO];
  }

  function saveDjs(djs) {
    try {
      localStorage.setItem(KEY, JSON.stringify(djs));
    } catch (_) {}
  }

  if (window.__contadorHost && window.__contadorHost.isConnected) {
    window.__contadorHost.style.display = "block";
    return;
  }

  const host = document.createElement("div");
  host.setAttribute("data-contador", "overlay");
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483646";
  host.style.pointerEvents = "none";
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);
  window.__contadorHost = host;

  const css = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    .scrim { position: fixed; inset: 0; background: rgba(8,7,6,.45); pointer-events: auto; }
    .panel {
      pointer-events: auto;
      position: fixed; top: 16px; right: 16px;
      width: min(440px, calc(100vw - 24px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      background: #1c1a17; color: #f4efe6;
      border: 1px solid #342f28; border-radius: 18px;
      box-shadow: 0 24px 60px rgba(0,0,0,.4);
      padding: 16px;
    }
    h1 { margin: 0 8px 0 0; font-size: 1.15rem; letter-spacing: -.03em; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    button { font: inherit; cursor: pointer; }
    .gold { height: 40px; padding: 0 14px; border: 0; border-radius: 10px; background: #e2b657; color: #1a1408; font-weight: 700; }
    .gold:disabled { filter: saturate(.4); cursor: wait; }
    .icon { width: 32px; height: 32px; border: 1px solid #342f28; background: transparent; color: #f4efe6; border-radius: 8px; }
    .muted { color: #9c9488; font-size: .86rem; margin: 0 0 12px; }
    .status { min-height: 1.2em; margin: 0 0 10px; font-size: .9rem; color: #9c9488; }
    .status.erro { color: #e08b7a; }
    .status.ok { color: #c8e2a8; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; background: #24211c; border: 1px solid #342f28; font-size: .85rem; }
    .chip button { border: 0; background: none; color: #9c9488; }
    .row { display: flex; gap: 6px; margin-bottom: 8px; }
    input[type=text] { flex: 1; height: 36px; border-radius: 8px; border: 1px solid #342f28; background: #12110f; color: #f4efe6; padding: 0 10px; }
    .ghost { height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid #342f28; background: transparent; color: #f4efe6; }
    .check { display: flex; align-items: center; gap: 6px; color: #9c9488; font-size: .85rem; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 7px 4px; border-bottom: 1px solid #342f28; font-size: .82rem; text-align: left; }
    th { color: #9c9488; font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .pos { color: #e2b657; font-weight: 700; }
    .card { margin-top: 12px; padding-top: 10px; border-top: 1px solid #342f28; }
    .card h2 { margin: 0; font-size: .95rem; }
    .tops { margin: 8px 0 0; padding: 0; list-style: none; color: #9c9488; font-size: .82rem; }
    .tops li { margin: 0 0 6px; }
    .panel { width: min(480px, calc(100vw - 24px)); }
  `;

  shadow.innerHTML = `
    <style>${css}</style>
    <div class="scrim" id="scrim"></div>
    <aside class="panel" role="dialog" aria-label="Contador de votos">
      <div class="top">
        <h1>Contador de votos</h1>
        <button class="icon" id="fechar" type="button" aria-label="Fechar">×</button>
      </div>
      <p class="muted">Adicione os @ dos DJs e conte os votos deste post.</p>
      <p class="status" id="status"></p>
      <button class="gold" id="contar" type="button">Contar votos</button>
      <p class="muted" style="margin-top:12px">DJs do contest</p>
      <div class="chips" id="chips"></div>
      <div class="row">
        <input id="novo" type="text" maxlength="32" placeholder="@outro.dj" />
        <button class="ghost" id="add" type="button">Adicionar</button>
      </div>
      <label class="check"><input id="respostas" type="checkbox" checked /> Incluir respostas</label>
      <label class="check"><input id="auto" type="checkbox" /> Ignorar auto-voto do DJ</label>
      <div id="resultado"></div>
    </aside>
  `;

  const $ = (id) => shadow.getElementById(id);
  const state = { djs: loadDjs(), last: null };

  function setStatus(texto, tipo) {
    const el = $("status");
    el.textContent = texto || "";
    el.className = "status" + (tipo ? ` ${tipo}` : "");
  }

  function renderChips() {
    const box = $("chips");
    box.replaceChildren();
    state.djs.forEach((dj) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.append(dj);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        state.djs = state.djs.filter((item) => item !== dj);
        saveDjs(state.djs);
        renderChips();
      });
      chip.append(btn);
      box.append(chip);
    });
  }

  function rankingUnicos(stats) {
    return Object.values(stats).sort(
      (a, b) =>
        b.usuariosUnicos.size - a.usuariosUnicos.size ||
        b.usuariosExclusivos.size - a.usuariosExclusivos.size ||
        a.handle.localeCompare(b.handle)
    );
  }

  function rankingRepetidos(stats) {
    return Object.values(stats).sort(
      (a, b) =>
        b.comentariosComMencao - a.comentariosComMencao ||
        b.totalOcorrenciasArroba - a.totalOcorrenciasArroba ||
        a.handle.localeCompare(b.handle)
    );
  }

  function medalha(idx) {
    return ["1º", "2º", "3º"][idx] || `${idx + 1}º`;
  }

  function esc(texto) {
    return String(texto)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function renderResultado(stats, resumo) {
    const unicos = rankingUnicos(stats);
    const repetidos = rankingRepetidos(stats);
    const somaU = unicos.reduce((a, i) => a + i.usuariosUnicos.size, 0);
    const somaR = repetidos.reduce((a, i) => a + i.comentariosComMencao, 0);
    const liderU = unicos[0]?.usuariosUnicos.size || 0;
    const liderR = repetidos[0]?.comentariosComMencao || 0;

    const linU = unicos
      .map((item, idx) => {
        const v = item.usuariosUnicos.size;
        const pct = somaU ? ((v / somaU) * 100).toFixed(1) : "0.0";
        const dif = v === liderU ? (idx === 0 ? "Líder" : "Empate") : `${v - liderU}`;
        return `<tr><td class="pos">${medalha(idx)}</td><td>${esc(item.handle)}</td><td class="num">${v}</td><td class="num">${item.usuariosExclusivos.size}</td><td class="num">${pct}%</td><td class="num">${dif}</td></tr>`;
      })
      .join("");

    const linR = repetidos
      .map((item, idx) => {
        const v = item.comentariosComMencao;
        const pct = somaR ? ((v / somaR) * 100).toFixed(1) : "0.0";
        const dif = v === liderR ? (idx === 0 ? "Líder" : "Empate") : `${v - liderR}`;
        const media = item.usuariosUnicos.size
          ? (item.comentariosComMencao / item.usuariosUnicos.size).toFixed(2)
          : "0.00";
        return `<tr><td class="pos">${medalha(idx)}</td><td>${esc(item.handle)}</td><td class="num">${v}</td><td class="num">${item.totalOcorrenciasArroba}</td><td class="num">${media}x</td><td class="num">${pct}%</td><td class="num">${dif}</td></tr>`;
      })
      .join("");

    const tops = repetidos
      .map((item) => {
        const lista = C.topApoiadores(item, 3);
        const txt = lista.length
          ? lista.map(([u, n]) => `@${u} (${n}x)`).join(", ")
          : "nenhum voto";
        return `<li><strong>${esc(item.handle)}</strong> — ${esc(txt)}</li>`;
      })
      .join("");

    $("resultado").innerHTML = `
      <div class="card">
        <p class="muted">${resumo.totalComentariosLidos} comentários · ${resumo.totalUsuariosVotantes} pessoas · ${resumo.usuariosMultiVoto} votaram em mais de um DJ</p>
        <button class="ghost" id="csv" type="button">Baixar CSV</button>
      </div>
      <div class="card">
        <h2>Tabela 1 — Por pessoa</h2>
        <table><thead><tr><th>Pos</th><th>DJ</th><th class="num">Únicos</th><th class="num">Excl.</th><th class="num">%</th><th class="num">Dif.</th></tr></thead><tbody>${linU}</tbody></table>
      </div>
      <div class="card">
        <h2>Tabela 2 — Todos os comentários</h2>
        <table><thead><tr><th>Pos</th><th>DJ</th><th class="num">Coment.</th><th class="num">@s</th><th class="num">Média</th><th class="num">%</th><th class="num">Dif.</th></tr></thead><tbody>${linR}</tbody></table>
      </div>
      <div class="card">
        <h2>Quem mais comentou</h2>
        <ul class="tops">${tops}</ul>
      </div>
    `;
    shadow.getElementById("csv").addEventListener("click", baixarCsv);
  }

  function baixarCsv() {
    if (!state.last) return;
    const linhas = [["DJ", "Votos_Unicos_1_Por_Pessoa", "Votos_Unicos_Exclusivos", "Comentarios_Totais_Com_Repeticao", "Total_Mencoes_Arroba"]];
    for (const item of rankingUnicos(state.last.stats)) {
      linhas.push([
        item.handle,
        item.usuariosUnicos.size,
        item.usuariosExclusivos.size,
        item.comentariosComMencao,
        item.totalOcorrenciasArroba,
      ]);
    }
    const blob = new Blob([linhas.map((l) => l.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "resultado_contest.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function contar() {
    if (!state.djs.length) {
      setStatus("Adicione pelo menos um @.", "erro");
      return;
    }
    const btn = $("contar");
    btn.disabled = true;
    setStatus("Coletando comentários…");
    try {
      const comentarios = await Col.collect({
        shortcode,
        includeReplies: $("respostas").checked,
        token: String(Date.now()),
        onProgress: (msg) => {
          if (msg && msg.detail) setStatus(msg.detail);
        },
      });
      const { stats, resumo } = C.contabilizarVotos(comentarios, state.djs, {
        ignorarAutoVoto: $("auto").checked,
      });
      state.last = { stats, resumo };
      renderResultado(stats, resumo);
      setStatus(`${resumo.totalComentariosLidos} comentários · ${resumo.totalUsuariosVotantes} pessoas votaram.`, "ok");
    } catch (err) {
      const login = err && err.message === "LOGIN";
      setStatus(
        login
          ? "Faça login no Instagram e clique de novo."
          : (err && err.message) || "Não consegui ler os comentários.",
        "erro"
      );
    } finally {
      btn.disabled = false;
    }
  }

  $("fechar").addEventListener("click", () => {
    host.remove();
    window.__contadorHost = null;
  });
  $("scrim").addEventListener("click", () => {
    host.remove();
    window.__contadorHost = null;
  });
  function adicionarDj() {
    const handle = C.normalizarHandle($("novo").value);
    if (!handle) return;
    if (!state.djs.includes(handle)) state.djs.push(handle);
    $("novo").value = "";
    saveDjs(state.djs);
    renderChips();
  }

  $("add").addEventListener("click", adicionarDj);
  $("novo").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      adicionarDj();
    }
  });
  $("contar").addEventListener("click", contar);
  renderChips();
  contar();
})();
