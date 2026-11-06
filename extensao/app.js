(() => {
  const C = window.ContadorContest;
  const IS_EXT = Boolean(globalThis.chrome?.runtime?.id);

  const els = {
    url: document.getElementById("url"),
    contar: document.getElementById("contar"),
    status: document.getElementById("status"),
    djList: document.getElementById("dj-list"),
    djNovo: document.getElementById("dj-novo"),
    djAdd: document.getElementById("dj-add"),
    incluir: document.getElementById("incluir-respostas"),
    ignorar: document.getElementById("ignorar-auto"),
    resultado: document.getElementById("resultado"),
    demo: document.getElementById("demo"),
  };

  const state = {
    djs: [...C.DJS_PADRAO],
    token: null,
    origem: "",
    last: null,
  };

  const IG_ORIGINS = ["https://www.instagram.com/*", "https://instagram.com/*"];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function setStatus(texto, tipo) {
    els.status.textContent = texto || "";
    els.status.className = "status" + (tipo ? ` ${tipo}` : "");
  }

  function renderChips() {
    els.djList.replaceChildren(
      ...state.djs.map((dj) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.append(dj);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", `Remover ${dj}`);
        btn.textContent = "×";
        btn.addEventListener("click", () => {
          state.djs = state.djs.filter((item) => item !== dj);
          persistConfig();
          renderChips();
        });
        chip.append(btn);
        return chip;
      })
    );
  }

  function adicionarDj() {
    const handle = C.normalizarHandle(els.djNovo.value);
    if (!handle) return;
    if (!state.djs.includes(handle)) state.djs.push(handle);
    els.djNovo.value = "";
    persistConfig();
    renderChips();
  }

  async function persistConfig() {
    if (!IS_EXT) return;
    await chrome.storage.local.set({
      djs: state.djs,
      incluirRespostas: els.incluir.checked,
      ignorarAutoVoto: els.ignorar.checked,
    });
  }

  async function carregarConfig() {
    if (!IS_EXT) return;
    const saved = await chrome.storage.local.get([
      "djs",
      "incluirRespostas",
      "ignorarAutoVoto",
      "pendingUrl",
    ]);
    if (Array.isArray(saved.djs) && saved.djs.length) {
      state.djs = saved.djs.map(C.normalizarHandle).filter(Boolean);
    }
    if (typeof saved.incluirRespostas === "boolean") els.incluir.checked = saved.incluirRespostas;
    if (typeof saved.ignorarAutoVoto === "boolean") els.ignorar.checked = saved.ignorarAutoVoto;
    if (saved.pendingUrl) {
      els.url.value = saved.pendingUrl;
      await chrome.storage.local.remove("pendingUrl");
    }
  }

  function barra(valor, maximo) {
    const pct = maximo > 0 ? Math.max(4, Math.round((valor / maximo) * 100)) : 0;
    return `<span class="bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
  }

  function escapeHtml(texto) {
    return String(texto)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
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
        b.usuariosUnicos.size - a.usuariosUnicos.size ||
        a.handle.localeCompare(b.handle)
    );
  }

  function medalha(idx) {
    return ["1º", "2º", "3º"][idx] || `${idx + 1}º`;
  }

  function renderResultado(stats, resumo, origem) {
    const unicos = rankingUnicos(stats);
    const repetidos = rankingRepetidos(stats);
    const somaUnicos = unicos.reduce((acc, item) => acc + item.usuariosUnicos.size, 0);
    const somaRep = repetidos.reduce((acc, item) => acc + item.comentariosComMencao, 0);
    const liderU = unicos[0]?.usuariosUnicos.size || 0;
    const liderR = repetidos[0]?.comentariosComMencao || 0;

    const linhasUnicos = unicos
      .map((item, idx) => {
        const votos = item.usuariosUnicos.size;
        const pct = somaUnicos ? ((votos / somaUnicos) * 100).toFixed(1) : "0.0";
        const dif = votos === liderU ? (idx === 0 ? "Líder" : "Empate") : `${votos - liderU}`;
        return `<tr>
          <td class="pos">${medalha(idx)}</td>
          <td>${escapeHtml(item.handle)}</td>
          <td class="num">${votos}</td>
          <td class="num">${item.usuariosExclusivos.size}</td>
          <td class="num">${pct}%</td>
          <td class="num">${dif}</td>
          <td>${barra(votos, liderU)}</td>
        </tr>`;
      })
      .join("");

    const linhasRep = repetidos
      .map((item, idx) => {
        const votos = item.comentariosComMencao;
        const pct = somaRep ? ((votos / somaRep) * 100).toFixed(1) : "0.0";
        const dif = votos === liderR ? (idx === 0 ? "Líder" : "Empate") : `${votos - liderR}`;
        const media = item.usuariosUnicos.size
          ? (item.comentariosComMencao / item.usuariosUnicos.size).toFixed(2)
          : "0.00";
        return `<tr>
          <td class="pos">${medalha(idx)}</td>
          <td>${escapeHtml(item.handle)}</td>
          <td class="num">${votos}</td>
          <td class="num">${item.totalOcorrenciasArroba}</td>
          <td class="num">${pct}%</td>
          <td class="num">${dif}</td>
          <td class="num">${media}x</td>
        </tr>`;
      })
      .join("");

    const tops = repetidos
      .map((item) => {
        const lista = C.topApoiadores(item, 3);
        const txt = lista.length
          ? lista.map(([u, n]) => `@${u} (${n}x)`).join(", ")
          : "nenhum voto";
        return `<li><strong>${escapeHtml(item.handle)}</strong> — ${escapeHtml(txt)}</li>`;
      })
      .join("");

    els.resultado.hidden = false;
    els.resultado.innerHTML = `
      <p class="resumo">
        <span>${resumo.totalComentariosLidos} comentários lidos</span>
        <span>${resumo.comentariosComVotoValido} com voto</span>
        <span>${resumo.totalUsuariosVotantes} pessoas votaram</span>
        ${
          resumo.usuariosMultiVoto
            ? `<span>${resumo.usuariosMultiVoto} marcaram mais de um DJ</span>`
            : ""
        }
        <span>${escapeHtml(origem)}</span>
      </p>
      <div class="acoes">
        <button id="csv" type="button">Baixar CSV</button>
      </div>
      <article class="tabela-card">
        <h2>Tabela 1 — Por pessoa, sem repetir</h2>
        <p class="hint">1 voto por usuário para cada DJ. Exclusivos = votaram só nele.</p>
        <table>
          <thead>
            <tr>
              <th>Pos</th><th>DJ</th><th class="num">Únicos</th>
              <th class="num">Exclusivos</th><th class="num">%</th>
              <th class="num">Dif. 1º</th><th></th>
            </tr>
          </thead>
          <tbody>${linhasUnicos}</tbody>
        </table>
      </article>
      <article class="tabela-card">
        <h2>Tabela 2 — Todos os comentários</h2>
        <p class="hint">Cada comentário conta. Total @s soma marcações repetidas no mesmo texto.</p>
        <table>
          <thead>
            <tr>
              <th>Pos</th><th>DJ</th><th class="num">Comentários</th>
              <th class="num">Total @s</th><th class="num">%</th>
              <th class="num">Dif. 1º</th><th class="num">Média/pessoa</th>
            </tr>
          </thead>
          <tbody>${linhasRep}</tbody>
        </table>
      </article>
      <article class="tabela-card">
        <h2>Quem mais comentou</h2>
        <ul class="tops">${tops}</ul>
      </article>
    `;

    document.getElementById("csv").addEventListener("click", baixarCsv);
  }

  function baixarCsv() {
    if (!state.last) return;
    const linhas = [
      [
        "DJ",
        "Votos_Unicos_1_Por_Pessoa",
        "Votos_Unicos_Exclusivos",
        "Comentarios_Totais_Com_Repeticao",
        "Total_Mencoes_Arroba",
        "Media_Comentarios_Por_Pessoa",
      ],
    ];
    for (const item of rankingUnicos(state.last.stats)) {
      const media = item.usuariosUnicos.size
        ? (item.comentariosComMencao / item.usuariosUnicos.size).toFixed(2)
        : "0.00";
      linhas.push([
        item.handle,
        item.usuariosUnicos.size,
        item.usuariosExclusivos.size,
        item.comentariosComMencao,
        item.totalOcorrenciasArroba,
        media,
      ]);
    }
    const blob = new Blob([linhas.map((l) => l.join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "resultado_contest.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function pararEspera() {
    els.contar.disabled = false;
    if (state.timeout) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }
  }

  function aplicarContagem(comentarios, origem) {
    const { stats, resumo } = C.contabilizarVotos(comentarios, state.djs, {
      ignorarAutoVoto: els.ignorar.checked,
    });
    state.last = { stats, resumo, origem };
    renderResultado(stats, resumo, origem);
    setStatus(
      `${resumo.totalComentariosLidos} comentários lidos · ${resumo.totalUsuariosVotantes} pessoas votaram.`,
      "ok"
    );
  }

  async function garantirPermissao() {
    const jaTem = await chrome.permissions.contains({ origins: IG_ORIGINS });
    if (jaTem) return true;
    return chrome.permissions.request({ origins: IG_ORIGINS });
  }

  async function esperarAba(tabId) {
    const inicio = Date.now();
    while (Date.now() - inicio < 30000) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") return tab;
      await delay(200);
    }
    throw new Error("O Instagram demorou demais para abrir.");
  }

  async function garantirAbaInstagram(postUrl) {
    const tabs = await chrome.tabs.query({
      url: ["https://www.instagram.com/*", "https://instagram.com/*"],
    });
    const usable = tabs.find((tab) => tab.url && !/accounts\/login|challenge/.test(tab.url));
    if (usable?.id) {
      return usable.status === "complete" ? usable : esperarAba(usable.id);
    }

    const created = await chrome.tabs.create({ url: postUrl, active: false });
    const loaded = await esperarAba(created.id);
    await delay(900);
    const atual = await chrome.tabs.get(loaded.id);
    if (/accounts\/login|challenge/.test(atual.url || "")) {
      await chrome.tabs.update(atual.id, { active: true });
      const err = new Error("LOGIN_TAB");
      throw err;
    }
    return atual;
  }

  function mensagemInstagram(msg) {
    if (msg.type === "PROGRESS" && msg.token === state.token) {
      setStatus(msg.detail || "Coletando comentários…");
    }
    if (msg.type === "DONE" && msg.token === state.token) {
      pararEspera();
      aplicarContagem(msg.comments || [], "Post do Instagram");
    }
    if (msg.type === "ERROR" && msg.token === state.token) {
      pararEspera();
      setStatus(
        msg.login || msg.message === "LOGIN"
          ? "Abra o Instagram neste navegador, faça login e clique em Contar de novo."
          : msg.message || "Não consegui ler os comentários.",
        "erro"
      );
    }
  }

  async function contar() {
    const shortcode = C.extrairShortcode(els.url.value);
    if (!shortcode) {
      setStatus("Cole o link completo do post ou reel do Instagram.", "erro");
      els.url.focus();
      return;
    }
    if (!state.djs.length) {
      setStatus("Adicione pelo menos um @ de DJ para contar.", "erro");
      return;
    }
    if (!IS_EXT) {
      setStatus("Abra esta página pelo ícone da extensão no Chrome ou Brave.", "erro");
      return;
    }

    const permitido = await garantirPermissao();
    if (!permitido) {
      setStatus("Preciso de permissão para ler o Instagram. Clique em Permitir.", "erro");
      return;
    }

    els.contar.disabled = true;
    els.resultado.hidden = true;
    state.token = crypto.randomUUID();
    state.timeout = setTimeout(() => {
      if (!els.contar.disabled) return;
      pararEspera();
      setStatus("A coleta travou. Recarregue o Instagram e tente de novo.", "erro");
    }, 120000);
    setStatus("Abrindo sua sessão do Instagram…");

    try {
      const postUrl = `https://www.instagram.com/p/${shortcode}/`;
      const tab = await garantirAbaInstagram(postUrl);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "ISOLATED",
        files: ["bridge.js"],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        files: ["collector.js"],
      });
      await delay(150);
      await chrome.tabs.sendMessage(tab.id, {
        type: "START",
        payload: {
          shortcode,
          includeReplies: els.incluir.checked,
          token: state.token,
        },
      });
    } catch (err) {
      pararEspera();
      if (err && err.message === "LOGIN_TAB") {
        setStatus("Abri o Instagram. Faça login nessa aba e clique em Contar de novo.", "erro");
        return;
      }
      setStatus(err?.message || "Não consegui começar a coleta.", "erro");
    }
  }

  function demo() {
    aplicarContagem(C.dadosDemo(), "Dados de exemplo");
  }

  els.contar.addEventListener("click", contar);
  els.djAdd.addEventListener("click", adicionarDj);
  els.djNovo.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      adicionarDj();
    }
  });
  els.url.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      contar();
    }
  });
  els.incluir.addEventListener("change", persistConfig);
  els.ignorar.addEventListener("change", persistConfig);
  els.demo.addEventListener("click", demo);

  if (IS_EXT) {
    chrome.runtime.onMessage.addListener(mensagemInstagram);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.pendingUrl?.newValue) {
        els.url.value = changes.pendingUrl.newValue;
        chrome.storage.local.remove("pendingUrl");
      }
    });
  }

  carregarConfig().then(renderChips);
  renderChips();
})();
