#!/usr/bin/env bash

set -e

export NODE_OPTIONS="${NODE_OPTIONS:-$(node docker/node-options.ts)}"

case "${NODE_ENTRYPOINT}" in
    "nest")
        node --enable-source-maps out/server/main-nest.mjs
        ;;
    "default" | "")
        node --enable-source-maps out/server/main.mjs
        ;;
    *)
        echo "unknown entrypoint \"${NODE_ENTRYPOINT}\""
        ;;
esac
