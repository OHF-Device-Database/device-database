.PHONY: build

PROFILE ?= release
TARGET ?= wasm32-wasip1

ALL := $(shell find -L src -type f)
OUT := target/$(TARGET)/$(PROFILE)/plugin.wasm

build: $(OUT)

$(OUT): $(ALL)
	cargo build --profile $(PROFILE) --target $(TARGET)
