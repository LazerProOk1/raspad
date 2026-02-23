# Raspad Game 2

Browser-based narrative horror game built with Phaser 3 + TypeScript + Vite.

## Run Locally

```bash
npm install
npm run dev
```

## Run Tests

```bash
npm test
```

## Dev Mode

Enable dev mode with URL parameter:

- `http://localhost:5173/?dev=1`

Toggle dev console:

- `F10`

Commands:

- `/set corruption <0|25|50|75|100>`
- `/set choice1 <A|B>`
- `/set choice2 <A|B>`
- `/give <rewardId>`
- `/remove <rewardId>`
- `/goto <archive|weapon|radio|photo>`
- `/force ending <wife|will|crown>`
- `/state dump`
- `/state reset`

Notes:

- Dev state uses `sessionStorage` with `raspad2_dev_` prefix.
- User save uses `localStorage` key `raspad2_save_v1`.

## itch.io Deployment (GitHub Actions)

Deployment workflow:

- `.github/workflows/deploy.yml`

Trigger:

- Push to `main` (or manual `workflow_dispatch`)

Required GitHub repository secrets:

- `ITCHIO_API_KEY`
- `ITCHIO_GAME` (format: `user/game-slug`)

Upload target channel:

- `html5` via butler: `butler push dist "${ITCHIO_GAME}:html5"`

## Content Warning

This game includes mature themes and is intended for **18+** audiences:

- suicide
- colonial violence
- psychological horror and oppression
