include make/common.mk

.PHONY: build-container

build-container:
	docker build \
		-t '$(IMAGE_TAG):latest' \
		-f Dockerfile \
		--build-context schema=../../schema \
		--build-context sqlc-plugin=$(shell dirname $(shell readlink -f plugin.wasm)) \
		.
