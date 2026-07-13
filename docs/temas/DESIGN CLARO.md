---
name: Premium Performance — Claro
colors:
  surface: '#f4f5ee'
  surface-dim: '#d8dace'
  surface-bright: '#f4f5ee'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaebe1'
  surface-container: '#e0e2d4'
  surface-container-high: '#d6d8c7'
  surface-container-highest: '#cccfb9'
  on-surface: '#1a1b15'
  on-surface-variant: '#4a4c3e'
  inverse-surface: '#2b2c26'
  inverse-on-surface: '#f0f1e8'
  outline: '#8c8f7a'
  outline-variant: '#d3d5c4'
  surface-tint: '#1a1b15'
  primary: '#1a1b15'
  on-primary: '#caf300'
  primary-container: '#caf300'
  on-primary-container: '#596c00'
  inverse-primary: '#caf300'
  secondary: '#8c4a35'
  on-secondary: '#ffffff'
  secondary-container: '#fbdccb'
  on-secondary-container: '#5e1700'
  tertiary: '#3d6b7a'
  on-tertiary: '#ffffff'
  tertiary-container: '#dceef3'
  on-tertiary-container: '#1b343d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  background: '#f4f5ee'
  on-background: '#1a1b15'
  surface-variant: '#dcded0'
---

## Brand & Style

Mesma marca do tema Preto — "Premium Performance" — com fundo e destaque invertidos. Não é uma identidade visual à parte (ao contrário das antigas propostas Azul/Laranja, aposentadas): a intenção é reconhecimento consistente entre os dois modos, só trocando qual cor é fundo e qual é ação.

## Colors

No tema Preto o lime (`#CAF300`) é a cor estrutural do CTA sobre fundo quase-preto. Sobre fundo claro, lime puro em blocos grandes (botão cheio, barra de progresso, avatar) lê como "cupom/promoção" — não como "performance premium" — porque perde o efeito neon que tem contra um fundo escuro, além de falhar contraste de texto/ícone fino em WCAG AA.

A solução: **Grafite** (`#1A1B15`, o mesmo tom de `surface` do tema Preto) assume o papel estrutural (`primary`) — CTA cheio, estado selecionado, indicador ativo. O **lime** vira acento — `on-primary` (texto sobre o CTA grafite) e `primary-container` (containers pequenos: badge "novo", ícone de destaque) — nunca dominando um bloco grande sozinho.

- **Primary (Grafite):** estrutural — CTA, seleção, indicador ativo.
- **On-primary / Primary-container (Lime):** acento — texto sobre CTA, badges pequenos.
- **Secondary (Terracota):** apoio raro, realces que não são ação.
- **Tertiary (Azul-petróleo):** informação terciária, estados neutros.
- **Error:** vermelho Material padrão (`#BA1A1A`), consistente com o restante da paleta clara.

## Typography

Sem mudança: Inter, hierarquia por peso/tamanho, mesma escala de tokens do tema Preto (ver `docs/DESIGN-SYSTEM.md`). Nenhuma fonte ou peso é exclusivo deste tema.

## Elevation & Shapes

Sem mudança: profundidade tonal pelo ramp de `surface-container-*`, sem sombra estrutural (ver `DESIGN.md` § Elevation). Cantos e componentes seguem os mesmos tokens `rounded.*` do tema Preto.

## Components

- **Botão primário:** `bg-primary text-on-primary` → fundo grafite, texto lime. Callback visual direto ao CTA do tema Preto (que é fundo lime, texto grafite) — os dois modos ficam como negativo um do outro, reforçando a mesma marca em vez de duas.
- **Chip selecionado / indicador ativo:** mesma lógica — grafite estrutural, lime só no texto/ícone.
- **Badge/destaque pequeno (ex. "novo"):** `bg-primary-container text-on-primary-container` → fundo lime, texto verde-oliva escuro (mesmo par já usado no tema Preto para essa combinação).
