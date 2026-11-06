# Contador de votos

Conta votos por menção (`@`) nos comentários de um post do Instagram. Útil para contests, enquetes e escolhas em que cada pessoa marca um perfil.

São duas tabelas:

1. **Por pessoa, sem repetir** — 1 voto por usuário para cada DJ
2. **Todos os comentários** — cada marcação conta, inclusive repetidas

Os `@` padrão (`@nova`, `@pulse`, `@orbit`) são só exemplo. Troque pelos perfis do seu contest.

## Safari

1. Abra `safari/instalar.html` no Safari
2. Mostre a barra de Favoritos: `Cmd + Shift + B`
3. Arraste o botão **Contar votos** para essa barra
4. Abra o post no Instagram, já logado
5. Clique em **Contar votos** nos Favoritos

O placar abre por cima do post. Dá para baixar o resultado em CSV.

Se o arrastar não funcionar, use **Copiar atalho** e cole no endereço de um favorito novo.

## Chrome, Brave ou Edge

1. Abra `chrome://extensions` (no Brave: `brave://extensions`)
2. Ligue **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `extensao`
5. Fixe o ícone, cole o link do post e aperte **Contar votos**

## Linha de comando

Opcional, para quem prefere o terminal:

```bash
python3 cli/contador.py --demo
python3 cli/contador.py "https://www.instagram.com/p/SHORTCODE/"
python3 cli/contador.py --clipboard
```

`--clipboard` lê o JSON gerado por `cli/coletor-navegador.js` (cole o script no console do Instagram).

## Estrutura

```
extensao/     extensão Chromium
safari/       atalho de Favoritos + overlay no post
cli/          contador em Python e coletor via console
scripts/      gera o atalho do Safari
docs/ai/      instruções para agentes de IA
```

Depois de editar `extensao/collector.js`, `extensao/counter.js` ou `safari/overlay.js`, rode:

```bash
python3 scripts/build-safari.py
```
