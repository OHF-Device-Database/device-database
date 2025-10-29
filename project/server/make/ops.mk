include make/common.mk

.PHONY: build-container restore

EPHEMERAL_DIR := .ephemeral
RESTORE_DIRECTORY := $(EPHEMERAL_DIR)/restored

RESTORE_NAME ?= $(shell date +'%Y%m%d%H%M%S').db

build-container:
	docker build \
		-t '$(IMAGE_TAG):latest' \
		-f Dockerfile \
		--build-context client=$(shell readlink -f package/client) \
		--build-context schema=../../schema \
		--build-context sqlc-plugin=$(shell dirname $(shell readlink -f plugin.wasm)) \
		.

restore: | $(RESTORE_DIRECTORY)
	@[ ! -z $(REPLICATION_TAG) ] || ( echo "[!] <REPLICATION_TAG> not set"; exit 1 )
	docker run --rm -it \
		-v '$(RESTORE_DIRECTORY):/volume' \
		-e AWS_ACCESS_KEY_ID='$(LITESTREAM_AWS_ACCESS_KEY_ID)' \
		-e AWS_SECRET_ACCESS_KEY='$(LITESTREAM_AWS_SECRET_ACCESS_KEY)' \
		litestream/litestream restore -o '/volume/$(RESTORE_NAME)' 's3://$(LITESTREAM_AWS_S3_PATH)/$(REPLICATION_TAG)'

$(RESTORE_DIRECTORY): | $(EPHEMERAL_DIR)
	mkdir '$(RESTORE_DIRECTORY)'

$(EPHEMERAL_DIR):
	mkdir '$(EPHEMERAL_DIR)'
