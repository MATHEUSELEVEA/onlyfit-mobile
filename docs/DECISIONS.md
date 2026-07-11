# DECISIONS.md

Registro leve de decisões de arquitetura (ADR). Cada entrada explica **por que** algo é como é, para ninguém (pessoa ou IA) desfazer sem contexto. Adicione ao fim; nunca reescreva o passado — supersede com uma entrada nova.

## Formato

```
## NNNN — Título curto
- Data: AAAA-MM-DD
- Status: aceita | supersedida por NNNN | revertida
- Contexto: qual problema/força motivou.
- Decisão: o que foi decidido.
- Consequência: o que isso implica (bom e ruim).
```

---

## 0001 — Reescrever o front do zero (v2) sobre o banco de produção do v1
- Data: 2026-07-10
- Status: aceita
- Contexto: o v1 acumulou dívida técnica; queríamos base mobile-first limpa sem perder os dados/usuários reais.
- Decisão: novo app (`onlyfit/`) do zero, consumindo o **mesmo** Supabase de produção do v1. Regra de negócio sensível continua no ecossistema/banco.
- Consequência: liberdade no front; porém banco é produção compartilhada — mudança de schema vira decisão de ecossistema e exige cuidado redobrado. Ver `docs/ECOSYSTEM.md`.

## 0002 — Multi-tema por tokens; só a cor muda
- Data: 2026-07-10
- Status: aceita
- Contexto: três propostas de design (preto/azul/laranja) divergiam em cor **e** fonte; o usuário deve poder trocar de tema.
- Decisão: cor via tokens (`themes.css` + Tailwind + `data-theme`, persistido em `localStorage`); tipografia unificada no padrão "TikTok" (Inter, hierarquia por peso), igual nos 3 temas. Referência estrutural do design: tema Azul. Padrão: preto.
- Consequência: componentes nunca conhecem cor concreta → novo tema não toca componente. Fontes das specs de tema são ignoradas de propósito. Ver `docs/DESIGN-SYSTEM.md`.

## 0003 — Estado de servidor no React Query; sem fetch em useEffect
- Data: 2026-07-10
- Status: aceita
- Contexto: evitar cache manual, `useEffect` de fetch e bugs de sincronização.
- Decisão: toda leitura/escrita do Supabase passa por hooks React Query; `useState` só para UI local.
- Consequência: menos código de sincronização, cache/retry padronizados. Ver `docs/MESSAGING-AND-CACHE.md`.

## 0004 — Remover `baseUrl` do tsconfig (deprecação TS 7.0)
- Data: 2026-07-10
- Status: aceita
- Contexto: `baseUrl` foi preterido e o TS avisa que deixará de funcionar na 7.0.
- Decisão: remover `baseUrl` e usar `paths` com caminho relativo (`"@/*": ["./src/*"]`), resolvido em relação ao tsconfig. O alias de runtime já é resolvido pelo Vite (`vite.config.ts`).
- Consequência: sem warning de deprecação; typecheck e alias `@/` seguem funcionando.

## 0005 — Escritas do cliente restritas a tabelas de interação
- Data: 2026-07-10
- Status: aceita
- Contexto: ao implementar curtir/comentar/seguir/assinar no v2, era preciso definir o que o front pode escrever no banco de produção compartilhado.
- Decisão: o cliente escreve apenas em `post_likes`, `post_comments` e `creator_follows` (linha do próprio usuário, garantida por RLS). `subscriptions`/`creator_memberships` são somente leitura — "Assinar" leva ao fluxo de checkout (futuro), nunca a um insert do front. Posts salvos ficam em `localStorage` até existir tabela.
- Consequência: impossível o front "liberar" conteúdo pago por engano; a lista de escritas vive em `docs/DATABASE.md` e cresce só com policy de RLS conferida.

## 0006 — Mutações otimistas com rollback como padrão de escrita
- Data: 2026-07-10
- Status: aceita
- Contexto: feed estilo Reels exige resposta imediata ao toque (curtir/seguir) mesmo com rede lenta.
- Decisão: toda escrita usa `useMutation` atualizando os caches do React Query em `onMutate` (com snapshot), revertendo em `onError`. Caches de outras features afetadas são atualizados por tipos estruturais mínimos (ex. follow atualiza feed e explorar sem acoplar imports).
- Consequência: UI instantânea e consistente entre telas; o custo é manter os updaters em sincronia com o shape dos caches (referências: `useToggleLike`, `useCreatorFollow`).

## 0007 — ESLint flat config no repositório
- Data: 2026-07-10
- Status: aceita
- Contexto: `npm run lint` existia no `package.json`, mas o ESLint nunca foi instalado/configurado — o gate de qualidade do CLAUDE.md não rodava.
- Decisão: adotar ESLint 9+ flat config (`eslint.config.js`) com `typescript-eslint`, `react-hooks` e `react-refresh`, além de `no-console` (permitindo `warn`/`error`).
- Consequência: `npm run lint` volta a valer como gate real de PR; regras de hooks pegam bugs de dependência em revisão.
