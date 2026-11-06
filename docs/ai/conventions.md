# Convenções

## Contagem

- Handle: minúsculas, com `@`, só `[a-z0-9._]`.
- Menção válida: regex com fronteira para não casar `@nova` dentro de `@novamente`.
- **Únicos**: um usuário conta no máximo 1 vez por DJ, mesmo com vários comentários.
- **Exclusivos**: votaram só naquele DJ.
- **Todos os comentários**: cada comentário com a menção conta; `totalOcorrenciasArroba` soma `@` repetidos no mesmo texto.
- Auto-voto (o DJ marcando a si mesmo) só entra se a opção estiver ligada.

Altere a regra nos dois lugares que a implementam: `extensao/counter.js` e `cli/contador.py`. Depois rode o build do Safari.

## Interface

Textos falam com quem está contando votos. Evite:

- “Sem Python”, “não abre terminal”, detalhes de implementação
- Nomes de pessoas, handles reais de contests, CSV de resultados reais
- Marca antiga `scripta` — o prefixo interno é `contador`

Defaults e demo usam handles fictícios: `@nova`, `@pulse`, `@orbit`. Quem for usar troca pelos `@` do contest.

## O que não entra no git

- `.instagram_session`, cookies, `sessionid`
- `*.csv` de resultados
- `.env`, `.DS_Store`

O App ID `936619743392459` é o da web do Instagram, não é segredo pessoal.

## Estilo

- Português do Brasil na UI e no README
- JavaScript sem bundler; Python 3 da stdlib no CLI
- CSS com a paleta já usada (`#12110f`, dourado `#e2b657`)
