# general

- proposed changes should lower-case only

- be terse

- do the smallest change possible unless states otherwise

## comments

- don't echo prompt in comments unless it pertains to invariants

- prioritize flow over strict character limits per line

## code

- use named / unnamed scopes over helper functions when those helpers are only used once

## testing

- consult `test` target in `make/dev.mk` for how to run tests
- some stuff (e.g. filesystem watching) doesn't work in harness sandboxes  
  suites generally detect this, and skip themselves.  
  run outside of sandbox when required.

# scripts

- scripts that depend on functionality in `src` should be located alongside functionality and defined as tool (`build/tool.ts`, `TOOL_BUILD_OUT_<...>` in `make/dev.mk`)  
  necessary because bundling is required for files in `src`
- scripts that don't depend on functionality in `src` should be type-strippable and placed in `scripts` directory
