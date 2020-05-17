#!/bin/bash

set -e

exit 1

# TODO
  # PROVIDER_NAME="${PROVIDER_NAME%*/}"      # remove the trailing "/"
  # PROVIDER_NAME="${PROVIDER_NAME##*/}"    # print everything after the final "/"
  # PROVIDER_IMAGE_TAG="infra-manager-tf-${PROVIDER_NAME}"
  # docker build \
  #   --build-arg "GO_VERSION=$(cat "${PROVIDERS_DIR}/${PROVIDER_NAME}/versions/go.txt")" \
  #   --build-arg "TF_PROVIDER_VERSION=$(cat "${PROVIDERS_DIR}/${PROVIDER_NAME}/versions/provider.txt")" \
  #   --build-arg "TF_PROVIDER_NAME=${PROVIDER_NAME}" \
  #   --build-arg "TF_PROVIDER_REPO_DIR=$(cat "${PROVIDERS_DIR}/${PROVIDER_NAME}/image/provider_repo_dir.txt")" \
  #   --rm=false \
  #   --tag "${PROVIDER_IMAGE_TAG}" \
  #   --file "${SCRIPT_DIR}/providers/Dockerfile" \
  #   "${SCRIPT_DIR}/providers"

  # docker run --rm \
  #   --entrypoint sh \
  #   -v "${TARGET_DIR}/src/api/providers/${PROVIDER_NAME}/:/target/:rw" \
  #   "${PROVIDER_IMAGE_TAG}" -c 'cp -r /outputs/api/. /target/'
  # docker run --rm \
  #   --entrypoint sh \
  #   -v "${TARGET_DIR}/src/codegen/providers/${PROVIDER_NAME}/:/target/:rw" \
  #   "${PROVIDER_IMAGE_TAG}" -c 'cp -r /outputs/codegen/. /target/'