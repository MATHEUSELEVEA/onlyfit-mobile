# AGENTS.md

## REGRA RÍGIDA E PRIORITÁRIA: ENTREGA SEMPRE NO GIT REMOTO

Esta é a primeira instrução operacional para qualquer agente. Quando o usuário pedir `push`, PR, merge ou deploy, é proibido encerrar com mudanças ou commits apenas locais. O agente deve partir da `main` atualizada, criar branch, fazer commit, enviar a branch ao remoto, abrir Pull Request para `main`, fazer merge do PR e confirmar que a `main` remota contém a entrega. Nunca faça commit ou push direto na `main`.

Arquivo padrão para agentes de IA (Cursor, GitHub Copilot, OpenAI Codex, Windsurf, Gemini e afins) que procuram um `AGENTS.md` na raiz do projeto.

## Leia o CLAUDE.md

O documento canônico deste repositório é **[`CLAUDE.md`](./CLAUDE.md)**. Ele vale para **qualquer** modelo ou ferramenta, não só o Claude. Leia-o inteiro antes de sugerir ou escrever código.
Leia também **[`SECURITY-SCALABILITY.md`](./SECURITY-SCALABILITY.md)** antes de qualquer mudança.

As regras invioláveis, a stack, como rodar e a estrutura de pastas estão lá. O detalhamento por tema está em [`docs/`](./docs/DOCUMENTATION-INDEX.md).

## Resumo mínimo (o CLAUDE.md manda)

- **Nunca** cor hardcoded — use tokens de tema (`bg-surface`, `text-primary`). O usuário troca de tema em runtime.
- **Nunca** tamanho de fonte arbitrário — use tokens (`text-body`, `text-label`).
- **Nunca** segredo no cliente — só a `anon key` do Supabase vai pro front. RLS autoriza acesso, não o front.
- **Simples > esperto.** Sem dependência, abstração ou arquivo a mais sem necessidade. Apague o que não usa.
- Pedido de PR, merge ou deploy exige o fluxo completo: branch a partir da `main`, commit, push da branch, Pull Request para `main` e merge do PR. Nunca encerre só com commit local.
- Migrations e Edge Functions pertencem ao `onlyfit-supabase` e são implantadas pelo GitHub Actions daquele repositório. Não execute deploy de backend a partir deste app.
- Antes de "pronto": `npm run build` e `npm run lint` limpos, e teste o fluxo real no app.

Qualquer conflito entre este resumo e o `CLAUDE.md`: **o `CLAUDE.md` vence.**

## Fluxo obrigatório do Trello

> Este fluxo só se aplica quando a atividade for escolhida no Trello, quando o
> usuário pedir para buscar trabalho no Trello ou quando a solicitação mencionar
> explicitamente um card. Solicitações diretas feitas fora do Trello podem ser
> implementadas sem criar, mover, atribuir ou exigir card; nesse caso, a conversa
> direta é a especificação.

- O quadro das tarefas originadas no Trello é Onlyfit: https://trello.com/b/INcLFTEw/onlyfit.
- Para trabalho originado no Trello, só desenvolva cards que já estejam em `Implementar (Baico, Dani)`; leia descrição, comentários, checklists, anexos e ajustes antes de editar.
- Antes de qualquer alteração de uma tarefa originada no Trello, abra `Membros` no card e adicione `matheus martins` (`matheusmartins42`, ARI `ari:cloud:trello::user/6a90ed725beaa073d9bdadc2`), confirmando que ele aparece como membro do cartão. Não use etiqueta com nome nem apenas uma menção. Se a integração não permitir atribuir, pare e informe; não pule a etapa.
- Priorize a etiqueta `PRIORIDADE`; mantenha o card em Implementar durante o trabalho. Ao concluir e testar, comente o resumo técnico e os testes e mova para `Validar (Nã, Deni)`, nunca diretamente para Pronto.
