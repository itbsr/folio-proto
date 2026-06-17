IMAGE          := dewarpnet-api
CONTAINER      := folio-infer
ENV_FILE       := ai-server/.env
PORT           := 8000
CONTAINER_PORT := 8000
BASE_HASH      := $(shell cat ai-server/Dockerfile.base ai-server/requirements.txt | shasum -a 256 | cut -c1-12)
BASE_IMAGE     := dewarpnet-base:$(BASE_HASH)
WEIGHTS_HASH   := $(shell cat ai-server/weights/* 2>/dev/null | shasum -a 256 | cut -c1-12)
WEIGHTS_IMAGE  := dewarpnet-weights:$(BASE_HASH)-$(WEIGHTS_HASH)

.PHONY: build-base
build-base:
	docker build -t $(BASE_IMAGE) -f ai-server/Dockerfile.base ai-server/

.PHONY: ensure-base
ensure-base:
	@docker image inspect $(BASE_IMAGE) >/dev/null 2>&1 || \
		$(MAKE) build-base

.PHONY: build-weights
build-weights: ensure-base
	docker build --build-arg BASE=$(BASE_IMAGE) -t $(WEIGHTS_IMAGE) -f ai-server/Dockerfile.weights ai-server/

.PHONY: ensure-weights
ensure-weights:
	@docker image inspect $(WEIGHTS_IMAGE) >/dev/null 2>&1 || \
		$(MAKE) build-weights

.PHONY: build
build: ensure-weights
	docker build --build-arg WEIGHTS=$(WEIGHTS_IMAGE) -t $(IMAGE) ai-server/

.PHONY: run
run:
	docker run --name $(CONTAINER) -p $(PORT):$(CONTAINER_PORT) --env-file $(ENV_FILE) -d $(IMAGE)

.PHONY: up
up: build run

.PHONY: stop
stop:
	docker stop $(CONTAINER) && docker rm $(CONTAINER)

.PHONY: restart
restart: stop run

.PHONY: logs
logs:
	docker logs -f $(CONTAINER)

.PHONY: clean
clean:
	docker rmi $(IMAGE) $(WEIGHTS_IMAGE) $(BASE_IMAGE)

.PHONY: deploy
deploy:
	docker stop $(CONTAINER) && docker rm $(CONTAINER)
	docker rmi $(IMAGE)
	$(MAKE) build
	docker run --name $(CONTAINER) -p $(PORT):$(CONTAINER_PORT) --env-file $(ENV_FILE) -d $(IMAGE)
