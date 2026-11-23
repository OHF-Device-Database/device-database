include make/common.mk

.PHONY: build-container

# build context is the repository root (pnpm workspace)
build-container:
	docker build \
		-t '$(IMAGE_TAG):latest' \
		-f Dockerfile \
		../..
