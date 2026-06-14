.PHONY: dev build start lint install \
        db-up db-down db-migrate db-seed db-reset db-studio \
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

# ── Docker / Database ──────────────────────────────────────────────────────────
db-up:
	docker-compose up -d

db-down:
	docker-compose down

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
setup: install db-up generate db-migrate db-seed
	@echo ""
	@echo "Setup complete. Run 'make dev' to start the server."
