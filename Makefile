IMAGE          := dewarpnet-api
CONTAINER      := folio-infer
ENV_FILE       := ai-server/.env
PORT           := 8000
CONTAINER_PORT := 8000

.PHONY: build
build:
	docker build -t $(IMAGE) ai-server/

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
	docker rmi $(IMAGE)

.PHONY: deploy
deploy: 
	docker stop $(CONTAINER) && docker rm $(CONTAINER)
	docker rmi $(IMAGE)
	docker build -t $(IMAGE) ai-server/
	docker run --name $(CONTAINER) -p $(PORT):$(CONTAINER_PORT) --env-file $(ENV_FILE) -d $(IMAGE)
