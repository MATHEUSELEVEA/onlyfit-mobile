# Segurança e escalabilidade

Leitura obrigatória antes de alterar o app React mobile/web.

- Somente URL e chave pública/anon do Supabase entram no bundle.
- RLS autoriza todo dado. Pagamento e acesso pago são confirmados no servidor/webhook.
- PAN/CVV são coletados exclusivamente no Stripe Payment Element.
- Toda lista tem limite/cursor. Inbox usa `list_my_conversations`; thread carrega página limitada.
- Um canal Realtime filtrado por responsabilidade, removido ao desmontar/background.
- Nunca logar sessão, token, CPF, saúde, payload de pagamento ou URL privada.
- Manter CSP/HSTS e allowlists de `vercel.json`/`netlify.toml`.
- Antes do PR: `npm audit --omit=dev --audit-level=high`, `npm run lint` e `npm run build`.
- Exceção temporária em 2026-07-26: React Router 7.18.1 reporta o advisory de RSC/Server Actions, mas este SPA usa apenas `BrowserRouter` clássico e não expõe RSC. Não regredir para 7.17 ou anterior; atualizar assim que houver release corrigida.

O contrato completo está em `../onlyfit-supabase/docs/SECURITY-SCALABILITY-100K.md`.
