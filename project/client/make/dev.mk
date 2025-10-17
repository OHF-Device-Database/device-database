.PHONY: test lint test

watch:
	@node --experimental-strip-types ./watch.ts

lint:
	npm exec -- eslint
	npm exec -- prettier --check .

test:
	@node --test \
		--import tsx \
		--enable-source-maps \
		--experimental-test-module-mocks \
		--experimental-test-coverage \
		--experimental-test-snapshots \
		--no-warnings=ExperimentalWarning \
		$(if $(TEST_SNAPSHOT),--test-update-snapshots,) $(UNIT)
