#!/usr/bin/env bash

set -e

export NODE_OPTIONS="$(node docker/node-options.ts)"

node --enable-source-maps --experimental-vm-modules out/server/main.mjs
