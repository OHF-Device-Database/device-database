include make/common.mk

.PHONY: build-container

EPHEMERAL_DIR := .ephemeral

build-container:
	docker build \
		-t '$(IMAGE_TAG):latest' \
		-f Dockerfile \
		--build-context client='$(shell readlink -f package/client)' \
		--build-context schema=../../schema \
		--build-context sqlc-plugin='$(shell dirname $(shell readlink -f plugin.wasm))' \
		.

$(EPHEMERAL_DIR):
	mkdir '$(EPHEMERAL_DIR)'
