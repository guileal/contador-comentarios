/**
 * Coletor via console do navegador, para usar com o CLI.
 *
 * 1. Abra o post no Instagram, já logado
 * 2. Abra o DevTools (Cmd + Option + I) na aba Console
 * 3. Cole este arquivo e aperte Enter
 * 4. Os comentários vão para a área de transferência
 * 5. No terminal: python3 cli/contador.py --clipboard
 */
(async () => {
  const devToolsCopy = typeof copy === "function" ? copy : null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  const match = window.location.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) {
    console.error("Abra a página do post ou reel do Instagram antes de rodar este script.");
    return;
  }

  const shortcode = match[1];
  let mediaId = 0n;
  for (const ch of shortcode) {
    mediaId = mediaId * 64n + BigInt(alphabet.indexOf(ch));
  }
  const mediaIdStr = mediaId.toString();

  console.log(`Coletando post ${shortcode} (media id ${mediaIdStr})…`);

  const headers = {
    "x-ig-app-id": "936619743392459",
    "x-requested-with": "XMLHttpRequest",
  };

  const comentarios = [];
  const vistos = new Set();
  let minId = null;
  let maxId = null;
  let pagina = 0;

  while (true) {
    pagina++;
    const params = new URLSearchParams({
      can_support_threading: "true",
      permalink_enabled: "false",
    });
    if (minId) params.set("min_id", minId);
    else if (maxId) params.set("max_id", maxId);

    const url = `https://www.instagram.com/api/v1/media/${mediaIdStr}/comments/?${params.toString()}`;
    const resp = await fetch(url, { headers, credentials: "include" });
    if (!resp.ok) {
      console.warn(`Parou na página ${pagina} (HTTP ${resp.status}).`);
      break;
    }
    const data = await resp.json();
    const lista = data.comments || [];
    let novos = 0;

    for (const item of lista) {
      const cid = String(item.pk || item.id || "");
      if (!cid || vistos.has(cid)) continue;
      vistos.add(cid);
      novos++;

      comentarios.push({
        id: cid,
        username: (item.user?.username || "desconhecido").toLowerCase(),
        text: item.text || "",
        is_reply: false,
      });

      const previewChildren = item.preview_child_comments || [];
      for (const child of previewChildren) {
        const rcid = String(child.pk || child.id || "");
        if (rcid && !vistos.has(rcid)) {
          vistos.add(rcid);
          comentarios.push({
            id: rcid,
            username: (child.user?.username || "desconhecido").toLowerCase(),
            text: child.text || "",
            is_reply: true,
          });
        }
      }
    }

    console.log(`Página ${pagina}: ${comentarios.length} comentários…`);

    if (data.next_min_id && data.next_min_id !== minId && novos > 0) {
      minId = data.next_min_id;
      maxId = null;
    } else if (data.next_max_id && data.next_max_id !== maxId && novos > 0) {
      maxId = data.next_max_id;
      minId = null;
    } else {
      break;
    }

    await new Promise((r) => setTimeout(r, 450));
  }

  const jsonOutput = JSON.stringify(comentarios, null, 2);
  window.dadosContest = comentarios;

  let copiado = false;
  if (devToolsCopy) {
    try {
      devToolsCopy(jsonOutput);
      copiado = true;
    } catch (_) {}
  }
  if (!copiado && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(jsonOutput);
      copiado = true;
    } catch (_) {}
  }
  if (!copiado) {
    try {
      const ta = document.createElement("textarea");
      ta.value = jsonOutput;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      copiado = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (_) {}
  }

  if (copiado) {
    console.log(`${comentarios.length} comentários copiados. Rode: python3 cli/contador.py --clipboard`);
  } else {
    console.warn("A cópia automática foi bloqueada. No console: copy(window.dadosContest)");
  }
})();
