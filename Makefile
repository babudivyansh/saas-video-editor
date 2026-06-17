.PHONY: dev build start lint install \
        db-migrate db-seed db-reset db-studio \
        test-ffmpeg generate setup

# ── Dev ────────────────────────────────────────────────────────────────────────
dev:
	npm run dev

build:
	npm run build

start:
	npm run start

lint:
	npm run lint

install:
	npm install

# ── Database ─────────────────────────────────────────────────────────────────
# Postgres + Redis must be running locally (or any reachable instance pointed to
# by DATABASE_URL / REDIS_URL in .env). Redis is optional in dev — lib/redis.ts
# falls back to an in-memory store when it's unreachable. docker-compose.yml is
# kept in the repo for production/optional use, but is not required for dev.
db-migrate:
	npx prisma migrate dev

db-seed:
	npx tsx prisma/seed.ts

db-reset:
	npx prisma migrate reset --force

db-studio:
	npx prisma studio

generate:
	npx prisma generate

# ── Tests ──────────────────────────────────────────────────────────────────────
test-ffmpeg:
	npx tsx utils/test-ffmpeg.ts

# ── First-time setup ───────────────────────────────────────────────────────────
# Assumes Postgres (and optionally Redis) are already running and reachable via .env.
setup: install generate db-migrate db-seed
	@echo ""
	@echo "Setup complete. Run 'make dev' to start the server."
