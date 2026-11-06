(() => {
  if (window.__contadorCollectorReady) return;
  window.__contadorCollectorReady = true;

  const APP_ID = "936619743392459";
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function emit(payload) {
    window.postMessage({ source: "contador-ig", ...payload }, "*");
  }

  function shortcodeFromLocation() {
    const match = String(location.pathname || "").match(
      /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/
    );
    return match ? match[1] : null;
  }

  function shortcodeToMediaId(shortcode) {
    let mediaId = 0n;
    for (const ch of shortcode) {
      const idx = ALPHABET.indexOf(ch);
      if (idx < 0) throw new Error("Link do Instagram inválido.");
      mediaId = mediaId * 64n + BigInt(idx);
    }
    return mediaId.toString();
  }

  async function igFetch(url) {
    const resp = await fetch(url, {
      credentials: "include",
      headers: {
        "x-ig-app-id": APP_ID,
        "x-requested-with": "XMLHttpRequest",
      },
    });
    const text = await resp.text();
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) throw new Error("LOGIN");
      throw new Error(`Instagram respondeu HTTP ${resp.status}.`);
    }
    try {
      return JSON.parse(text);
    } catch {
      if (/login|log in/i.test(text)) throw new Error("LOGIN");
      throw new Error("Resposta inesperada do Instagram.");
    }
  }

  function pushComment(comentarios, vistos, item, isReply) {
    const cid = String(item.pk || item.id || "");
    if (!cid || vistos.has(cid)) return false;
    vistos.add(cid);
    comentarios.push({
      id: cid,
      username: (item.user?.username || "desconhecido").toLowerCase(),
      text: item.text || "",
      is_reply: Boolean(isReply),
    });
    return true;
  }

  async function coletarRespostas(mediaId, commentId, vistos, comentarios) {
    let maxId = null;
    let novos = 0;

    for (let pagina = 0; pagina < 50; pagina++) {
      const params = new URLSearchParams();
      if (maxId) params.set("max_id", maxId);
      const qs = params.toString();
      const url = `https://www.instagram.com/api/v1/media/${mediaId}/comments/${commentId}/inline_child_comments/${qs ? `?${qs}` : ""}`;

      let data;
      try {
        data = await igFetch(url);
      } catch {
        break;
      }

      for (const item of data.child_comments || []) {
        if (pushComment(comentarios, vistos, item, true)) novos += 1;
      }

      const hasMore = data.has_more_tail_child_comments || data.has_more_head_child_comments;
      const nextMax = data.next_max_child_cursor || data.next_min_child_cursor;
      if (!hasMore || !nextMax || nextMax === maxId) break;
      maxId = nextMax;
      await sleep(350);
    }

    return novos;
  }

  async function collect({ shortcode, includeReplies, token, onProgress } = {}) {
    const report = (payload) => {
      emit(payload);
      if (typeof onProgress === "function") onProgress(payload);
    };
    const mediaId = shortcodeToMediaId(shortcode);
    const comentarios = [];
    const vistos = new Set();
    let minId = null;
    let maxId = null;
    let emptyStreak = 0;

    report({
      type: "PROGRESS",
      token,
      page: 0,
      count: 0,
      detail: "Conectando ao Instagram…",
    });

    for (let pagina = 1; pagina <= 200; pagina++) {
      const params = new URLSearchParams({
        can_support_threading: "true",
        permalink_enabled: "false",
      });
      if (minId) params.set("min_id", minId);
      else if (maxId) params.set("max_id", maxId);

      const url = `https://www.instagram.com/api/v1/media/${mediaId}/comments/?${params}`;
      const data = await igFetch(url);

      if (data.status && data.status !== "ok" && !data.comments) {
        const msg = String(data.message || "");
        if (/login|not authorized|please wait/i.test(msg)) throw new Error("LOGIN");
        throw new Error(msg || "O Instagram recusou a leitura dos comentários.");
      }

      const lista = data.comments || [];
      let novos = 0;

      for (const item of lista) {
        if (pushComment(comentarios, vistos, item, false)) novos += 1;

        if (!includeReplies) continue;

        const preview = item.preview_child_comments || [];
        for (const child of preview) {
          if (pushComment(comentarios, vistos, child, true)) novos += 1;
        }

        const cid = String(item.pk || item.id || "");
        const childCount = Number(item.child_comment_count || 0);
        if (cid && childCount > preview.length) {
          novos += await coletarRespostas(mediaId, cid, vistos, comentarios);
        }
      }

      report({
        type: "PROGRESS",
        token,
        page: pagina,
        count: comentarios.length,
        detail: `Página ${pagina}: ${comentarios.length} comentários coletados…`,
      });

      const nextMin = data.next_min_id;
      const nextMax = data.next_max_id;

      let advanced = false;
      if (nextMin && nextMin !== minId) {
        minId = nextMin;
        maxId = null;
        advanced = true;
      } else if (nextMax && nextMax !== maxId) {
        maxId = nextMax;
        minId = null;
        advanced = true;
      }

      if (!advanced) break;
      if (novos === 0) {
        emptyStreak += 1;
        if (emptyStreak >= 2) break;
      } else {
        emptyStreak = 0;
      }

      await sleep(450);
    }

    report({ type: "DONE", token, comments: comentarios });
    return comentarios;
  }

  window.ContadorCollector = { collect, shortcodeFromLocation };

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "contador-ext" || data.type !== "START") return;

    collect(data.payload).catch((err) => {
      const login = err && err.message === "LOGIN";
      emit({
        type: "ERROR",
        token: data.payload?.token,
        login,
        message: login
          ? "Faça login no Instagram neste navegador e tente de novo."
          : (err && err.message) || "Falha ao coletar comentários.",
      });
    });
  });
})();
