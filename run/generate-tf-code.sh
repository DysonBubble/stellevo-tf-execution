#!/bin/bash

set -e

SCRIPT_PATH="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

CONFIG_REPO_DIR="$(readlink -f "$(realpath "$1")")"
TARGET_DIR="$(readlink -f "$(realpath "$2")")"
if [[ -z "$3" ]]; then
  CACHE_DIR="${TARGET_DIR}/stellevo_cache"
else
  CACHE_DIR="$(readlink -f "$(realpath "$3")")"
fi

if [[ -z "${TARGET_DIR}" ]] || [[ -z "${CONFIG_REPO_DIR}" ]]; then
  echo "Please specify configuration directory as first argument, and target directory as second argument." 1>&2
  exit 1
fi

ROOT_DIR="$(readlink -f "$(realpath "${SCRIPT_DIR}/..")")"
ASSETS_DIR="${ROOT_DIR}/assets"

# Using -u with cp was also considered, but it's maybe better to overwrite possibly newer stuff with framework supplied files... ?
echo "Copying static files to target directory..."
if [[ "${TARGET_DIR}" != "${CONFIG_REPO_DIR}" ]]; then
  mkdir "${TARGET_DIR}"
fi
cp --preserve=timestamps -r "${ASSETS_DIR}/static/." "${TARGET_DIR}"
echo "Done with copying static files to target directory."

echo "Collecting platforms..."
readarray -d '' ALL_PLATFORM_NAMES < <(find "${CONFIG_REPO_DIR}/platforms" -mindepth 1 -maxdepth 1 -type d -printf "%f\0")
declare -A PLATFORM_PROVIDERS
PLATFORM_DIRS=()
for PLATFORM_NAME in "${ALL_PLATFORM_NAMES[@]}"; do
  CUR_PLATFORM_DIR="$(echo -n "$(cat "${CONFIG_REPO_DIR}/platforms/${PLATFORM_NAME}/location.txt" | head -n 1)")"
  if [[ -z "${CUR_PLATFORM_DIR##*:*}" ]]; then # If location has ':' in it, it is interpreted as url
    CUR_PLATFORM_URL="${CUR_PLATFORM_DIR}"
    CUR_PLATFORM_VERSION="$(cat "${CONFIG_REPO_DIR}/platforms/${PLATFORM_NAME}/version.txt")"
    CUR_PLATFORM_DIR="${CACHE_DIR}/platforms/${PLATFORM_NAME}/${CUR_PLATFORM_VERSION}"
    if [[ ! -d "${CUR_PLATFORM_DIR}" ]]; then # If platform repository has not been cached before
      # Get the platform repository using git clone
      git clone --depth 1 --branch "${CUR_PLATFORM_VERSION}" "${CUR_PLATFORM_URL}" "${CUR_PLATFORM_DIR}"
    fi
  else
    # Location is directory
    CUR_PLATFORM_DIR="$(readlink -f "$(realpath "${CUR_PLATFORM_DIR}")")"
  fi
  readarray -d '' CUR_PLATFORM_PROVIDERS < <(find "${CUR_PLATFORM_DIR}/providers" -mindepth 1 -maxdepth 1 -type d -printf "%f\0" )
  for CUR_PLATFORM_PROVIDER in "${CUR_PLATFORM_PROVIDERS[@]}"; do
    if [[ ! "${PLATFORM_PROVIDERS[$CUR_PLATFORM_PROVIDER]+_}" ]]; then
      # TODO check here if config repo has version override for this provider
      PLATFORM_PROVIDERS[$CUR_PLATFORM_PROVIDER]="$(cat "${CUR_PLATFORM_DIR}/providers/${CUR_PLATFORM_PROVIDER}/versions/provider.txt")"
    fi
  done
  PLATFORM_DIRS+=("${CUR_PLATFORM_DIR}")
done
echo "Done collecting platforms."

echo "Collecting providers..."
for PROVIDER_NAME in "${!PLATFORM_PROVIDERS[@]}"; do
  PROVIDER_VERSION="${PLATFORM_PROVIDERS[$PROVIDER_NAME]}"
  PROVIDER_CACHE_DIR="${CACHE_DIR}/providers/${PROVIDER_NAME}/${PROVIDER_VERSION}"
  if [[ ! -d "${PROVIDER_CACHE_DIR}" ]]; then # If provider release artifact has not been cached before
    # Download zip file containing generated .ts and .json files
    # Unzip can't handle stdin as input, so DL to temp file. TODO consider using BusyBox's unzip, as showed in https://unix.stackexchange.com/questions/2690/how-to-redirect-output-of-wget-as-input-to-unzip
    PROVIDER_DL_FILE="$(mktemp -u)"
    (curl -sSL --output "${PROVIDER_DL_FILE}" 'https://github.com/DysonBubble/stellevo-tf-provider-'"${PROVIDER_NAME}"'/releases/download/'"${PROVIDER_VERSION}"'/provider.zip' \
      && mkdir -p "${PROVIDER_CACHE_DIR}" \
      && unzip "${PROVIDER_DL_FILE}"  -d "${PROVIDER_CACHE_DIR}" ) || "${SCRIPT_DIR}/build-provider-locally.sh" "${PROVIDER_DL_DIR}"
  fi
    
  # We now have provider code in subfolders within "${PROVIDER_DL_DIR}/outputs"
  mkdir -p "${TARGET_DIR}/src/api/providers/${PROVIDER_NAME}"
  cp --preserve=timestamps -r "${PROVIDER_CACHE_DIR}/outputs/api/." "${TARGET_DIR}/src/api/providers/${PROVIDER_NAME}/"
  mkdir -p "${TARGET_DIR}/src/codegen/providers/${PROVIDER_NAME}"
  cp --preserve=timestamps -r "${PROVIDER_CACHE_DIR}/outputs/codegen/." "${TARGET_DIR}/src/codegen/providers/${PROVIDER_NAME}/"
  rm -rf "${PROVIDER_DL_DIR}"
done
echo "Done collecting providers"

echo "Generating TS and other files..."
NODE_IMAGE="node:$(cat "${CONFIG_REPO_DIR}/versions/run/node.txt")"
CODEGEN_DIR="${ASSETS_DIR}/codegen"
if [[ ! -d "${CODEGEN_DIR}/node_modules" ]]; then
  # pre-2. Restore packages
  docker run \
    --rm \
    -v "${CODEGEN_DIR}/:/project/:rw" \
    --entrypoint npm \
    -w /project/ \
    "${NODE_IMAGE}" \
    install
fi
docker run \
  --rm \
  -v "${CODEGEN_DIR}/:/project/:rw" \
  -v "${TARGET_DIR}/:/output/:rw" \
  -v "${CONFIG_REPO_DIR}/:/config/:ro" \
  --entrypoint sh \
  -w /project/ \
  "${NODE_IMAGE}" \
  -c 'node --unhandled-rejections=strict node_modules/.bin/ts-node src/main.ts'
echo "Done with generating TS and other files."

CONFIG_FILES_DIR="${CONFIG_REPO_DIR}/src/config"
if [[ "${TARGET_DIR}" != "${CONFIG_REPO_DIR}" ]]; then
  echo "Copying configuration TS files to target folder..."
  readarray -d '' ALL_CONFIG_FILES < <(find "${CONFIG_FILES_DIR}" -name '*.ts' -printf "%P\0")
  TARGET_CONFIG_DIR="${TARGET_DIR}/src/config"
  mkdir -p "${TARGET_CONFIG_DIR}"
  # We must do cd for cp to work properly. We could spawn new shell and do cd within, but then passing array argument would be pure hell.
  OLD_CUR_DIR="$(pwd)"
  cd "${CONFIG_FILES_DIR}/"; printf '%s\0' "${ALL_CONFIG_FILES[@]}" | xargs -0 cp --preserve=timestamps --parent -t "${TARGET_CONFIG_DIR}"; cd "${OLD_CUR_DIR}"
  echo "Done with copying configuration TS files to target folder"
fi

# 13. Run entrypoint TS file.
# Note that ts-node *deletes* composite option from tsconfig ( https://github.com/TypeStrong/ts-node/issues/811 , the quoted code in the issue), so all validation that various files don't reference forbidden ones is gone.
# Therefore we compile using tsc + run created JS using node.
echo "Compiling TS code and generating TF code..."
docker run \
  --rm \
  -v "${TARGET_DIR}/:/project/:rw" \
  --entrypoint sh \
  -w /project/ \
  "${NODE_IMAGE}" \
  -c \
  'npm install && node node_modules/.bin/tsc --build && mkdir -p tf_out && node --unhandled-rejections=strict --experimental-specifier-resolution=node ts_out/entrypoint'
echo "Done with compiling TS code and generating TF code."
