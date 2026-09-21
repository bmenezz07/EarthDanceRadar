# Earthdance Radar

PWA mobile-first para localizar barracas e pessoas durante o Earthdance RS 2026. Abre direto no radar, sem cadastro ou senha.

## Recursos

- Identidade automática por dispositivo, com nome editável em um toque
- GPS contínuo e bússola com distância/azimute em tempo real
- Barraca salva em um toque e mantida offline
- Pessoas próximas sincronizadas online a cada 7 segundos
- Mapa OpenStreetMap com cache oportunista dos tiles visitados
- Supabase gratuito com RLS e segredo individual do dispositivo
- APIs Vercel em `/api/ping` e `/api/tent`

## Desenvolvimento

```bash
npm install
npm run dev
```

O projeto possui configurações públicas de fallback do Supabase e pode ser implantado sem variáveis adicionais. A chave utilizada é publishable e o acesso é limitado no banco por RLS/RPC.

## Observações de sensores

GPS e orientação exigem HTTPS em celulares. No iPhone, a permissão da bússola precisa ser liberada por um toque no botão exibido pelo app; isso é uma exigência do Safari e não bloqueia o restante da interface.
