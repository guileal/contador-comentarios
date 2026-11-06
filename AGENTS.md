# Instruções para agentes

Leia `docs/ai/` antes de alterar o código.

- Visão geral e mapa do repositório: [docs/ai/README.md](docs/ai/README.md)
- Como as peças se encaixam: [docs/ai/architecture.md](docs/ai/architecture.md)
- Regras de contagem e estilo: [docs/ai/conventions.md](docs/ai/conventions.md)
- Fluxos de mudança: [docs/ai/workflows.md](docs/ai/workflows.md)

Resumo rápido:

1. Não commitar cookies, `sessionid`, CSV de resultados reais nem `.DS_Store`.
2. Handles padrão e dados de demo são fictícios (`@nova`, `@pulse`, `@orbit`).
3. Depois de editar collector, counter ou overlay, rode `python3 scripts/build-safari.py`.
4. Textos de interface falam com quem vai votar ou contar — sem menção a Python, terminal ou implementação.
