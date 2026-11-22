# 💍 Convite de Casamento

Convite digital com confirmação de presença, painel dos noivos e resumo no Telegram.
Roda 100% grátis no **Cloudflare Workers + D1** (sem cartão de crédito e sem "hibernar").

## Como funciona

| Página | Endereço | Para quem |
|---|---|---|
| Convite pessoal | `/c/<código>` | Cada convidado recebe o seu link |
| Página inicial | `/` | Quem acessa sem link: vê só os nomes e a data |
| Painel | `/admin` | Os noivos (protegido por senha) |

**Convite intransferível.** Cada convite tem um link único e impossível de adivinhar, com as
pessoas **nomeadas**. Exemplo: "Família Souza" com João, Maria, Pedro e Ana. O convidado só pode
marcar quem vai entre esses nomes: não dá para incluir acompanhantes nem aumentar o número
de pessoas (isso é validado no servidor). Se um link vazar, use **Gerar novo link** no painel
e o antigo para de funcionar.

**Telegram.** Aviso na hora a cada confirmação ou recusa, e resumo diário às 20h (horário de
Brasília) com os totais, a lista de confirmados e quem ainda não respondeu. Também há o botão
"Enviar resumo agora".

## Publicar (uma vez só, cerca de 10 minutos)

Pré-requisito: crie uma conta grátis em <https://dash.cloudflare.com/sign-up>.

```powershell
npm install
```

```powershell
npx wrangler login
```

```powershell
npx wrangler d1 create convite-db
```

Copie o `database_id` que aparecer e cole no `wrangler.toml`, no lugar de `COLE_AQUI_O_ID_DO_BANCO`.

```powershell
npm run db:init:remote
```

```powershell
npx wrangler secret put ADMIN_PASSWORD
```

(digite a senha do painel)

```powershell
npm run deploy
```

O site fica em `https://convite-casamento.<seu-usuario>.workers.dev`. Acesse `/admin`, preencha
a aba **Evento**, conecte o **Telegram** e comece a cadastrar os convites. Para usar um domínio
próprio (ex.: `anaepedro.com.br`), adicione-o em *Workers → convite-casamento → Settings → Domains*.

Para publicar alterações depois, basta rodar `npm run deploy` de novo.

## Rodar no computador (testes)

```powershell
npm run db:init:local
```

```powershell
npm run dev
```

Abra <http://localhost:8787/admin>. A senha local fica em `.dev.vars` (`noivos2026`).

## Estrutura

```
src/worker.js      API, regras de RSVP, Telegram e cron do resumo diário
schema.sql         Tabelas: settings, invites, members
public/convite.html  Convite (mobile-first)
public/admin.html    Painel dos noivos
public/index.html    Página inicial
public/style.css     Identidade visual (cores, fontes, botões)
public/common.js     Utilitários (datas, ícones, animações)
```

Limites do plano grátis: 100 mil acessos por dia e 5 GB de banco, bem mais do que um casamento precisa.
