(function (root) {
  const DJS_PADRAO = ["@nova", "@pulse", "@orbit"];

  function normalizarHandle(handle) {
    let limpo = String(handle || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    if (!limpo) return "";
    if (!limpo.startsWith("@")) limpo = "@" + limpo;
    limpo = "@" + limpo.slice(1).replace(/[^a-z0-9._]/g, "");
    if (limpo.length < 3) return "";
    return limpo;
  }

  function escapeRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function contabilizarVotos(comentarios, djs, opcoes) {
    const ignorarAutoVoto = Boolean(opcoes && opcoes.ignorarAutoVoto);
    const djsNorm = [];
    const vistos = new Set();
    for (const dj of djs) {
      const n = normalizarHandle(dj);
      if (!n || vistos.has(n)) continue;
      vistos.add(n);
      djsNorm.push(n);
    }

    const stats = {};
    const padroes = {};
    for (const dj of djsNorm) {
      stats[dj] = {
        handle: dj,
        usuariosUnicos: new Set(),
        usuariosExclusivos: new Set(),
        comentariosComMencao: 0,
        totalOcorrenciasArroba: 0,
        contagemPorUsuario: {},
      };
      padroes[dj] = new RegExp(
        `(?<![a-zA-Z0-9._])@${escapeRegex(dj.slice(1))}(?![a-zA-Z0-9._])`,
        "gi"
      );
    }

    let total = 0;
    let comVoto = 0;
    const participantes = new Set();
    const djsPorUsuario = new Map();

    for (const com of comentarios || []) {
      total += 1;
      const usuario = String(com.username || "")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase();
      const texto = com.text || com.texto || "";
      let votou = false;

      for (const dj of djsNorm) {
        const regex = padroes[dj];
        regex.lastIndex = 0;
        const matches = texto.match(regex);
        if (!matches) continue;
        if (ignorarAutoVoto && usuario === dj.slice(1)) continue;

        votou = true;
        const est = stats[dj];
        est.usuariosUnicos.add(usuario);
        est.comentariosComMencao += 1;
        est.totalOcorrenciasArroba += matches.length;
        est.contagemPorUsuario[usuario] = (est.contagemPorUsuario[usuario] || 0) + 1;
        participantes.add(usuario);
        if (!djsPorUsuario.has(usuario)) djsPorUsuario.set(usuario, new Set());
        djsPorUsuario.get(usuario).add(dj);
      }

      if (votou) comVoto += 1;
    }

    let multi = 0;
    for (const [usuario, setDjs] of djsPorUsuario.entries()) {
      if (setDjs.size === 1) {
        stats[[...setDjs][0]].usuariosExclusivos.add(usuario);
      } else if (setDjs.size > 1) {
        multi += 1;
      }
    }

    return {
      stats,
      resumo: {
        totalComentariosLidos: total,
        comentariosComVotoValido: comVoto,
        comentariosSemDj: total - comVoto,
        totalUsuariosVotantes: participantes.size,
        usuariosMultiVoto: multi,
      },
    };
  }

  function topApoiadores(est, n) {
    return Object.entries(est.contagemPorUsuario)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n || 3);
  }

  function dadosDemo() {
    const rows = [
      ["ana.beats", "fecha com @nova"],
      ["ana.beats", "@nova sem dúvida"],
      ["ana.beats", "@nova @nova"],
      ["leo.mix", "Tem que ser @nova"],
      ["sofia.k", "@NOVA"],
      ["sofia.k", "meu voto: @nova"],
      ["rafa", "@nova"],
      ["bia.fest", "@pulse"],
      ["bia.fest", "@pulse toca muito"],
      ["caio", "@pulse"],
      ["mari", "@Pulse"],
      ["joao.v", "@pulse na line"],
      ["nanda", "@pulse"],
      ["duda", "@orbit"],
      ["duda", "@orbit"],
      ["duda", "@orbit"],
      ["theo", "@orbit"],
      ["lara", "@orbit até o fim"],
      ["mix.user", "quero @nova e @orbit"],
      ["pergunta", "que horas começa? @amigo"],
    ];
    return rows.map((row, i) => ({
      id: "demo_" + (i + 1),
      username: row[0],
      text: row[1],
      is_reply: false,
    }));
  }

  function extrairShortcode(urlOuCodigo) {
    const texto = String(urlOuCodigo || "").trim();
    const match = texto.match(
      /(?:instagram\.com|instagr\.am)\/(?:[A-Za-z0-9_.-]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
    );
    if (match) return match[1];
    if (/^[A-Za-z0-9_-]{8,15}$/.test(texto)) return texto;
    return null;
  }

  root.ContadorContest = {
    DJS_PADRAO,
    normalizarHandle,
    contabilizarVotos,
    topApoiadores,
    dadosDemo,
    extrairShortcode,
  };
})(typeof window !== "undefined" ? window : globalThis);
