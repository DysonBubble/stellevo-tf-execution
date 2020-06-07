#!/bin/bash
set -e

# TODO make this script also work in Mac

SCRIPT_PATH="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

CONFIG_REPO_DIR="$(readlink -f "$(realpath "$1")")"
TARGET_DIR="$(readlink -f "$(realpath "$2")")"
STELLEVO_ACTIONS="$3"

if [[ -z "${CONFIG_REPO_DIR}" ]] || [[ -z "${TARGET_DIR}" ]] || [[ -z "${STELLEVO_ACTIONS}" ]]; then
  echo "Usage: <script> <config repo dir> <target dir> <actions>"
  echo "  Where actions is a string containing JSON array of strings, each of which one of the following:"
  echo "    - copy: will set up required files for developing configuration"
  echo "    - init: will do same as copy, but also create files required when generating TF code"
  echo "    - generate: will do the TF code generation, assumes that init action has already been called"
  exit 1
fi

ROOT_DIR="$(readlink -f "$(realpath "${SCRIPT_DIR}/..")")"

echo "Restoring Node packages..."
NODE_IMAGE="node:$(cat "${CONFIG_REPO_DIR}/versions/run/node.txt")"
CODEGEN_DIR="${ROOT_DIR}/assets/codegen"
# if [[ ! -d "${CODEGEN_DIR}/node_modules" ]]; then
  docker run \
    --rm \
    -v "${CODEGEN_DIR}/:/project/:rw" \
    --entrypoint npm \
    -w /project/ \
    "${NODE_IMAGE}" \
    install
# fi
echo "Done restoring Node packages."
PREPARE_IMAGE_TAG="stellevo-build:0.1.0"
PREPARE_IMAGE_ID="$(docker image ls -q "${PREPARE_IMAGE_TAG}")"
if [[ -z "${PREPARE_IMAGE_ID}" ]]; then
  echo "Building Docker image for running the actions..."
  echo "FROM ${NODE_IMAGE}
RUN apk update && apk add git curl" | docker build --tag "${PREPARE_IMAGE_TAG}" -
  echo "Done building Docker image for running the actions."
fi

echo "Running actions..."
docker run \
  --rm \
  -v "${ROOT_DIR}/:/project/:rw" \
  -v "${TARGET_DIR}/:/output/:rw" \
  -v "${CONFIG_REPO_DIR}/:/config/:ro" \
  --entrypoint sh \
  -w /project/assets/codegen \
  --env "STELLEVO_ACTIONS=${STELLEVO_ACTIONS}" \
  "${PREPARE_IMAGE_TAG}" \
  -c 'node --unhandled-rejections=strict node_modules/.bin/ts-node src/index.ts'
echo "Done running actions."
