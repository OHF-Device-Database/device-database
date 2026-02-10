#!/usr/bin/env bash

set -e

export NODE_OPTIONS="$(node docker/node-options.ts)"

if [[ "${LITESTREAM_ENABLE}" == "true" ]]; then
    if [[ -z ${DATABASE_PATH} ]]; then
        echo '[!] <DATABASE_PATH> not set'
        exit 1
    fi

    if [[ -z ${REPLICATION_TAG_PATH} ]]; then
        echo '[!] <REPLICATION_TAG_PATH> not set'
        exit 1
    fi

    if [[ -z ${LITESTREAM_AWS_S3_PATH} ]]; then
        echo '[!] <LITESTREAM_AWS_S3_PATH> not set'
        exit 1
    fi

    # litestream does not prevent divergent databases from replicating into the same bucket
    # if this were to happen, it would cause data corruption
    # to prevent this, a random subdirectory name is generated, and saved to persistent storage alongside the database
    # if another instance of the device database is brought up with an empty volume, it will not write into the same directory
    if [[ ! -f "${REPLICATION_TAG_PATH}" ]]; then
        tr -dc A-Za-z0-9 </dev/urandom | head -c 16 > "${REPLICATION_TAG_PATH}"
    fi;

    AWS_ACCESS_KEY_ID="${LITESTREAM_AWS_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${LITESTREAM_AWS_SECRET_ACCESS_KEY}" \
    LITESTREAM_DATABASE_PATH="${DATABASE_PATH}" \
    LITESTREAM_REPLICA_URI="s3://${LITESTREAM_AWS_S3_PATH}/$(cat "${REPLICATION_TAG_PATH}")" \
        litestream replicate \
            -exec 'node --enable-source-maps out/server/main.mjs' \
            -config docker/litestream.yaml
elif [[ "${LITESTREAM_ENABLE}" == "false" ]]; then
    node --enable-source-maps --experimental-vm-modules out/server/main.mjs
else
    echo '[!] <LITESTREAM_ENABLE> should be "true" or "false"'
fi
