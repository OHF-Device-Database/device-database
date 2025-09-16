.PHONY: build test build-container
.NOTPARALLEL: build

build:
	$(MAKE) --directory schema
	$(MAKE) --directory tool/sqlc-generate-typescript-plugin
	$(MAKE) --directory project/server

test:
	$(MAKE) --directory project/server test

build-container:
	$(MAKE) --directory project/server -f make/ops.mk build-container
