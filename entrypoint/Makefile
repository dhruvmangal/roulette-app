COMPOSE = docker compose --env-file .env -f docker-compose.yml
DEV = $(COMPOSE) -f docker-compose.dev.yml
PROD = $(COMPOSE) -f docker-compose.prod.yml

.PHONY: install-docker dev dev-tools prod down logs migrate migrate-status migrate-undo seed psql redis-cli reset backup restore android-build

dev:
	@test -f .env || cp .env.example .env
	$(DEV) up --build

dev-tools:
	@test -f .env || cp .env.example .env
	$(DEV) --profile tools up --build

# Installs Docker Engine + Compose on Linux; a no-op if present or not on Linux.
install-docker:
	sh scripts/install-docker.sh

prod: install-docker
	@test -f .env || (echo 'Create .env with production secrets first.' && exit 1)
	$(PROD) up -d --build

down:
	$(DEV) down??
	$(PROD) down

logs:
	$(DEV) logs -f --tail=100

# $(call sequelize,<command>) runs a sequelize-cli command in the migrate container.
sequelize = $(DEV) run --rm migrate sh -lc 'npm run --silent sequelize --workspace=@roulette/backend -- $(1)'

# Applies pending migrations from backend/src/db/migrations (no rebuild needed).
migrate:
	$(call sequelize,db:migrate)

# Lists every migration as up or down.
migrate-status:
	$(call sequelize,db:migrate:status)

# Reverts the most recent migration.
migrate-undo:
	$(call sequelize,db:migrate:undo)

seed:
	$(call sequelize,db:seed:all)

psql:
	$(DEV) exec postgres sh -lc 'psql -U "$$POSTGRES_USER" "$$POSTGRES_DB"'

redis-cli:
	$(DEV) exec redis sh -lc 'redis-cli -a "$$REDIS_PASSWORD"'

reset:
	sh scripts/reset-dev-data.sh

backup:
	sh scripts/backup.sh

restore:
	sh scripts/restore.sh "$(FILE)"

# Google ships the Android build tools (aapt2) for x86-64 Linux only, so the
# image is amd64 even on Apple Silicon (Docker Desktop emulates it).
# Optional: ROULETTE_PUBLIC_HOST=play.example.com VITE_PUBLIC_URL=https://play.example.com make android-build
android-build:
	docker build --platform linux/amd64 -f ../mobile/Dockerfile.android -t roulette-android \
		$(if $(ROULETTE_PUBLIC_HOST),--build-arg ROULETTE_PUBLIC_HOST=$(ROULETTE_PUBLIC_HOST)) \
		$(if $(VITE_PUBLIC_URL),--build-arg VITE_PUBLIC_URL=$(VITE_PUBLIC_URL)) ..
	docker run --rm --platform linux/amd64 -v "$$PWD/../artifacts:/artifacts" roulette-android