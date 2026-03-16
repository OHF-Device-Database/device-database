#!/usr/bin/env bash

set -e

export NODE_OPTIONS="$(node docker/node-options.ts)"

node --enable-source-maps out/server/main.mjs
