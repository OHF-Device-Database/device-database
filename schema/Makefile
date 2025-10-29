.PHONY: build clean

BUILD_DIR := out
BUILD_DIR_TYPESCRIPT := $(BUILD_DIR)/typescript

BUILD_OUT_BUNDLE := $(BUILD_DIR)/bundle.yaml

BUILD_OUT_SCHEMA_JSON := $(BUILD_DIR)/schema.json
BUILD_OUT_SCHEMA_TYPESCRIPT := $(BUILD_DIR_TYPESCRIPT)/schema.ts

BUILD_OUT := $(BUILD_OUT_BUNDLE) $(BUILD_OUT_SCHEMA_JSON) $(BUILD_OUT_SCHEMA_TYPESCRIPT)

BUILD_IN_BUNDLE_MAIN := spec/main.yaml
BUILD_IN_BUNDLE := $(BUILD_IN_BUNDLE_MAIN) $(shell find -L spec -type f ! -path '$(BUILD_IN_BUNDLE_MAIN)') src/bundle.ts

BUILD_IN_SCHEMA_TYPESCRIPT := $(BUILD_OUT_BUNDLE) src/typescript.ts

BUILD_IN := $(BUILD_IN_BUNDLE)

build: $(BUILD_OUT)

$(BUILD_DIR):
	mkdir $(BUILD_DIR)

$(BUILD_DIR_TYPESCRIPT): | $(BUILD_DIR)
	mkdir $(BUILD_DIR_TYPESCRIPT)

$(BUILD_OUT_BUNDLE): $(BUILD_IN_BUNDLE) | $(BUILD_DIR)
	@node \
		--experimental-strip-types --disable-warning=ExperimentalWarning \
		src/bundle.ts --spec $(BUILD_IN_BUNDLE_MAIN) --out $(BUILD_OUT_BUNDLE)

$(BUILD_OUT_SCHEMA_JSON): $(BUILD_IN_BUNDLE) | $(BUILD_DIR)
	@node \
		--experimental-strip-types --disable-warning=ExperimentalWarning \
		src/lint.ts --bundle $(BUILD_OUT_BUNDLE)
	@node \
		--experimental-strip-types --disable-warning=ExperimentalWarning \
		src/bundle.ts --spec $(BUILD_IN_BUNDLE_MAIN) --out $(BUILD_OUT_SCHEMA_JSON)

$(BUILD_OUT_SCHEMA_TYPESCRIPT): $(BUILD_IN_SCHEMA_TYPESCRIPT) | $(BUILD_DIR_TYPESCRIPT)
	@node \
		--experimental-strip-types --disable-warning=ExperimentalWarning \
		src/lint.ts --bundle $(BUILD_OUT_BUNDLE)
	@node \
		--experimental-strip-types --disable-warning=ExperimentalWarning \
		src/typescript.ts --spec $(BUILD_OUT_BUNDLE) --out $(BUILD_OUT_SCHEMA_TYPESCRIPT)

clean:
	rm -r $(BUILD_DIR)
