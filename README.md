# MYTHOS

Plateforme de jeu narratif multijoueur propulsée par IA. MYTHOS combine une expérience temps réel (websocket) et une génération narrative en streaming pour proposer des parties coopératives immersives.

## Aperçu

- **Expérience** : jeu narratif en temps réel, sessions multijoueurs, progression guidée par un maître de jeu IA.
- **Architecture** : monorepo avec backend NestJS + frontend Next.js.
- **Objectif** : fournir un MVP robuste, prêt à être déployé et itéré.

## Stack

- **Frontend** : Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend** : NestJS 10, Prisma 5, PostgreSQL, Socket.IO
- **IA** : Anthropic (Claude) ou OpenAI (configurable)
- **Cache/temps réel** : Redis + WebSocket

## Structure du dépôt

```
backend/   # API, WebSockets, IA, Prisma
frontend/  # UI, pages Next.js, sockets client
```

## Prérequis

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- npm (ou pnpm/yarn si vous adaptez les commandes)

## Configuration des variables d’environnement

### Backend

Copier et adapter le fichier d’exemple :

```
cp backend/.env.example backend/.env
```

Variables principales (voir [backend/.env.example](backend/.env.example)) :

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`, `JWT_EXPIRATION`
- `AI_PROVIDER` (`anthropic` ou `openai`)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
- `AI_MODEL`
- `PORT` (par défaut 3001)
- `CORS_ORIGIN` (ex. http://localhost:3000)

### Frontend

Créer/mettre à jour le fichier : [frontend/.env](frontend/.env)

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001/game
```

## Installation

```
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## Initialisation de la base de données

Depuis [backend](backend) :

```
npm run db:setup
```

Optionnel (seed) :

```
npm run db:seed
```

## Lancement en local

### Backend (API + WebSocket)

Depuis [backend](backend) :

```
npm run start:dev
```

Le serveur écoute sur `http://localhost:3001` (API sous `/api`).

### Frontend

Depuis [frontend](frontend) :

```
npm run dev
```

L’interface est disponible sur `http://localhost:3000`.

## Scripts utiles

### Backend

- `npm run start:dev` : serveur NestJS en mode watch
- `npm run build` : build production
- `npm run prisma:migrate` : migrations en local
- `npm run prisma:studio` : Prisma Studio

### Frontend

- `npm run dev` : Next.js en mode développement
- `npm run build` : build production
- `npm run start` : démarrage du build

## Notes d’architecture

- **Auth** : JWT + stratégies Passport (Google OAuth possible).
- **Temps réel** : Socket.IO côté backend et client.
- **IA** : service unifié via `AI_PROVIDER` et `AI_MODEL`.
- **Scénarios** : packs organisés dans [backend/src/scenarios](backend/src/scenarios).

## Déploiement (résumé)

- Frontend : Vercel (Next.js)
- Backend : Render/Railway (NestJS)
- Base de données : Neon/PostgreSQL

## Équipe

- Samy Zerouali — Backend & IA
- Yassir Sabbar — Frontend
- Kays Zahidi — Game Design & Scénarios
- Youri Emmanuel — Design & DevOps

## Licence

Projet académique / MVP — droits réservés par l’équipe.
