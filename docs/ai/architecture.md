# Arquitetura

Não há servidor próprio. A coleta usa a sessão já aberta no Instagram (`x-ig-app-id` público da web, `936619743392459`).

## Pastas

| Pasta | Papel |
| --- | --- |
| `extensao/` | Extensão Manifest V3 (Chrome, Brave, Edge) |
| `safari/` | Página de instalação + overlay injetado no post |
| `cli/` | Contador em Python e coletor colado no console |
| `scripts/` | Gera o atalho embutido em `safari/instalar.html` |

## Fontes compartilhadas

A lógica de coleta e de contagem vive na extensão:

- `extensao/collector.js` — pagina comentários e respostas da API web do Instagram; expõe `window.ContadorCollector`
- `extensao/counter.js` — normaliza `@`, conta votos, dados de demo; expõe `window.ContadorContest`
- `safari/overlay.js` — UI do Safari (shadow DOM sobre o post)

O atalho do Safari **não consegue** `fetch` de arquivos locais (`file://`). Por isso `scripts/build-safari.py` concatena os três JS e embute o resultado em `safari/instalar.html` (`<textarea id="bundle">`). A página de instalação monta um `javascript:` bookmarklet.

## Extensão

Fluxo ao clicar em **Contar votos**:

1. `background.js` abre `app.html` e, se a aba atual for um post, guarda a URL
2. `app.js` pede permissão de host do Instagram, abre/reusa uma aba logada
3. Injeta `bridge.js` (mundo isolado) e `collector.js` (mundo MAIN)
4. O collector posta mensagens `contador-ig`; o bridge reenvia ao service worker e devolve `contador-ext` / `START`

Não misture os nomes das mensagens (`contador-ig` / `contador-ext`).

## CLI

`cli/contador.py` aceita URL, arquivo, clipboard ou `--demo`. Cookie `sessionid` é opcional e, se salvo, vai para `cli/.instagram_session` (gitignored). `cli/coletor-navegador.js` é só o fallback do console.
