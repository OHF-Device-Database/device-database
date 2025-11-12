.PHONY: build test build-container install-dependency-sqlc
.NOTPARALLEL: build

EPHEMERAL_DIR := .ephemeral
EPHEMERAL_SQLC_DIR := $(EPHEMERAL_DIR)/sqlc

build:
	$(MAKE) --directory schema
	$(MAKE) --directory tool/sqlc-generate-typescript-plugin
	$(MAKE) --directory project/server

test:
	$(MAKE) --directory project/server test

build-container:
	$(MAKE) --directory project/server -f make/ops.mk build-container

$(EPHEMERAL_DIR):
	mkdir -p $(EPHEMERAL_DIR)

install-dependency-sqlc: | $(EPHEMERAL_DIR)
	[ -d '$(EPHEMERAL_SQLC_DIR)' ] || git clone https://github.com/OHF-Device-Database/sqlc.git $(EPHEMERAL_SQLC_DIR)
	cd '$(EPHEMERAL_SQLC_DIR)'; GOPATH='$(abspath .ephemeral/go)' go install ./cmd/sqlc
