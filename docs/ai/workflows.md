# Fluxos de trabalho

## Mudar coleta ou contagem

1. Edite `extensao/collector.js` e/ou `extensao/counter.js`
2. Se a regra de voto mudou, espelhe em `cli/contador.py`
3. Rode `python3 scripts/build-safari.py`
4. Recarregue a extensão em `chrome://extensions`
5. No Safari, apague o favorito antigo e arraste de novo a partir de `safari/instalar.html`

Sem o passo 3, o atalho do Safari fica desatualizado.

## Mudar o overlay do Safari

1. Edite `safari/overlay.js`
2. Rode `python3 scripts/build-safari.py`
3. Reinstale o favorito

Não edite o conteúdo de `<textarea id="bundle">` na mão.

## Mudar a extensão (UI)

`extensao/app.html`, `app.js`, `app.css`, `background.js`, `bridge.js` e `manifest.json` não passam pelo build do Safari. Recarregar a extensão basta.

Ícones: `extensao/icons/icon{16,48,128}.png`.

## Conferir a contagem sem Instagram

Na extensão, use **Ver com dados de exemplo**. No CLI:

```bash
python3 cli/contador.py --demo
```

## Publicar ou atualizar o GitHub

Repo: `guileal/contador-comentarios`. Commits só com pedido explícito. Antes do push, `git status` e confirme que nenhum cookie ou CSV real entrou.
