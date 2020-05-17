#!/bin/bash

set -e

SCRIPT_PATH="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

CONFIG_REPO_DIR="$(readlink -f "$(realpath "$1")")"
TARGET_DIR="$(readlink -f "$(realpath "$2")")"

if [[ -z "${TARGET_DIR}" ]] || [[ -z "${CONFIG_REPO_DIR}" ]]; then
  echo "Please specify configuration directory as first argument, and target directory as second argument." 1>&2
  exit 1
fi

ROOT_DIR="$(readlink -f "$(realpath "${SCRIPT_DIR}/..")")"
ASSETS_DIR="${ROOT_DIR}/assets"

# 1. Copy static files to target dir
mkdir "${TARGET_DIR}"
cp -r "${ASSETS_DIR}/static/." "${TARGET_DIR}"

# 2. TODO generate package.json file (utilize packages folder inside config repository)

# 3. Install the NPM modules for the target directory
NODE_IMAGE="node:$(cat "${CONFIG_REPO_DIR}/versions/run/node.txt")"
docker run \
  --rm \
  -v "${TARGET_DIR}/:/project/:rw" \
  -w /project/ \
  --entrypoint npm \
  "${NODE_IMAGE}" \
  install

# 4. Collect platforms
readarray -d '' ALL_PLATFORM_NAMES < <(find "${CONFIG_REPO_DIR}/platforms" -mindepth 1 -maxdepth 1 -type d -printf "%f\0")
declare -A PLATFORM_PROVIDERS
PLATFORM_DIRS=()
for PLATFORM_NAME in "${ALL_PLATFORM_NAMES[@]}"; do
  CUR_PLATFORM_DIR="$(echo -n "$(cat "${CONFIG_REPO_DIR}/platforms/${PLATFORM_NAME}/location.txt" | head -n 1)")"
  readarray -d '' CUR_PLATFORM_PROVIDERS < <(find "${CUR_PLATFORM_DIR}/providers" -mindepth 1 -maxdepth 1 -type d -printf "%f\0" )
  for CUR_PLATFORM_PROVIDER in "${CUR_PLATFORM_PROVIDERS[@]}"; do
    if [[ ! "${PLATFORM_PROVIDERS[$CUR_PLATFORM_PROVIDER]+_}" ]]; then
      # TODO check here if config repo has version override for this provider
      PLATFORM_PROVIDERS[$CUR_PLATFORM_PROVIDER]="$(cat "${CUR_PLATFORM_DIR}/providers/${CUR_PLATFORM_PROVIDER}/versions/provider.txt")"
    fi
  done
  PLATFORM_DIRS+=("${CUR_PLATFORM_DIR}")
done

# 5. Build provider images which will have output files, and copy the files from image to target dir
for PROVIDER_NAME in "${!PLATFORM_PROVIDERS[@]}"; do
  # Download zip file containing generated .ts and .json files
  PROVIDER_DL_DIR="$(mktemp -d)"
  PROVIDER_VERSION="${PLATFORM_PROVIDERS[$PROVIDER_NAME]}"
  (curl -sSL --output "${PROVIDER_DL_DIR}/provider.zip" 'https://github.com/DysonBubble/stellevo-tf-provider-'"${PROVIDER_NAME}"'/releases/download/'"${PROVIDER_VERSION}"'/provider.zip' \
    && unzip "${PROVIDER_DL_DIR}/provider.zip" -d "${PROVIDER_DL_DIR}" ) || "${SCRIPT_DIR}/build-provider-locally.sh" "${PROVIDER_DL_DIR}"
    
  # We now have provider code in subfolders within "${PROVIDER_DL_DIR}/outputs"
  mkdir -p "${TARGET_DIR}/src/api/providers/${PROVIDER_NAME}"
  cp -r "${PROVIDER_DL_DIR}/outputs/api/." "${TARGET_DIR}/src/api/providers/${PROVIDER_NAME}/"
  mkdir -p "${TARGET_DIR}/src/codegen/providers/${PROVIDER_NAME}"
  cp -r "${PROVIDER_DL_DIR}/outputs/codegen/." "${TARGET_DIR}/src/codegen/providers/${PROVIDER_NAME}/"
  rm -rf "${PROVIDER_DL_DIR}"
done

# 6. Generate files in api/common/platforms/resources folder
# Creating symlinks from one docker volume to another, inside a docker volume, is causing some havoc, so let's just run npm-install...
# The 'ln -s /project_node_modules/ node_modules' command for says error (ln: node_modules/project_node_modules: Read-only file system), but still creates symlink... But then node executable can't find the modules anyway.
# And copying the node_modules takes ages
mkdir -p "${TARGET_DIR}/src/api/common/platforms/resources" "${TARGET_DIR}/src/api/common/platforms/schemas"
docker run \
  --rm \
  -v "${ASSETS_DIR}/codegen/:/project/:rw" \
  -v "${TARGET_DIR}/src/api/common/platforms/:/output/:rw" \
  --entrypoint sh \
  -w /project/ \
  "${NODE_IMAGE}" \
  -c 'npm install && echo '"'"'export const allProviders = [...new Set<string>(['"$(printf '"%s", ' "${!PLATFORM_PROVIDERS[@]}")"'])];'"'"' > src/providers/providers.ts && node node_modules/.bin/ts-node src/providers/resources/generate-ts.ts > /output/resources/index.ts && node node_modules/.bin/ts-node src/providers/resources/generate-tsconfig.ts > /output/resources/tsconfig.json && node node_modules/.bin/ts-node src/providers/schemas/generate-ts.ts > /output/schemas/index.ts && node node_modules/.bin/ts-node src/providers/schemas/generate-tsconfig.ts > /output/schemas/tsconfig.json'

# 7. Generate files in codegen/common/platform folder
docker run \
  --rm \
  -v "${ASSETS_DIR}/codegen/:/project/:ro" \
  -v "${TARGET_DIR}/src/codegen/common/platforms/:/output/:rw" \
  --entrypoint sh \
  -w /project/ \
  "${NODE_IMAGE}" \
  -c 'node node_modules/.bin/ts-node src/providers/codegen/generate-ts.ts > /output/index.ts && node node_modules/.bin/ts-node src/providers/codegen/generate-tsconfig.ts > /output/tsconfig.json'

for PLATFORM_INDEX in "${!ALL_PLATFORM_NAMES[@]}"; do
  # 8. Copy platform code files to platforms/<provider> folder
  TARGET_PLATFORM_DIR="${TARGET_DIR}/src/platforms/${ALL_PLATFORM_NAMES[PLATFORM_INDEX]}"
  mkdir -p "${TARGET_PLATFORM_DIR}"
  cp -r "${PLATFORM_DIRS[PLATFORM_INDEX]}/api/src/." "${TARGET_PLATFORM_DIR}"

  # 9. Generate tsconfig.json files for platform
  # find example_repo_platform/api/src -mindepth 1 -type f -printf '"%P",'
  # TODO when platforms can depend on each other, this generation will make more sense
  docker run \
    --rm \
    -v "${ASSETS_DIR}/codegen/:/project/:rw" \
    -v "${TARGET_PLATFORM_DIR}/:/output/:rw" \
    --entrypoint sh \
    -w /project/ \
    "${NODE_IMAGE}" \
    -c 'echo '"'"'export const dependantPlatforms = [...new Set<string>([])];'"'"' > src/platforms/platforms.ts && node node_modules/.bin/ts-node src/platforms/generate-tsconfig.ts > /output/tsconfig.json'
done

# 10. Copy config code files to config folder
readarray -d '' ALL_CONFIG_FILES < <(find "${CONFIG_REPO_DIR}/config" -name '*.ts' -printf "%P\0")
TARGET_CONFIG_DIR="${TARGET_DIR}/src/config"
mkdir -p "${TARGET_CONFIG_DIR}"
# We must do cd for cp to work properly. We could spawn new shell and do cd within, but then passing array argument would be pure hell.
OLD_CUR_DIR="$(pwd)"
cd "${CONFIG_REPO_DIR}/config/"; printf '%s\0' "${ALL_CONFIG_FILES[@]}" | xargs -0 cp --parent -t "${TARGET_CONFIG_DIR}"; cd "${OLD_CUR_DIR}"

# 11. Generate tsconfig.json file for config exports
# TODO need to do this also for config libs
docker run \
  --rm \
  -v "${ASSETS_DIR}/codegen/:/project/:rw" \
  -v "${TARGET_DIR}/src/config/exports/:/output/:rw" \
  --entrypoint sh \
  -w /project/ \
  "${NODE_IMAGE}" \
  -c 'echo '"'"'export const allPlatforms = [...new Set<string>(['"$(printf '"%s", ' "${ALL_PLATFORM_NAMES[@]}")"'])];'"'"' > src/config/platforms.ts && node node_modules/.bin/ts-node src/config/generate-tsconfig.ts > /output/tsconfig.json'

# 12. Generate entrypoint TS file
readarray -d '' ALL_CONFIG_EXPORT_FILES < <(find "${CONFIG_REPO_DIR}/config/exports" -name '*.ts' -printf "%P\0")
docker run \
  --rm \
  -v "${ASSETS_DIR}/codegen/:/project/:rw" \
  -v "${TARGET_DIR}/src/entrypoint/:/output/:rw" \
  --entrypoint sh \
  -w /project/ \
  "${NODE_IMAGE}" \
  -c 'echo '"'"'export const allConfigFilePaths = [...new Set<string>(['"$(printf '"%s", ' "${ALL_CONFIG_EXPORT_FILES[@]}")"'])];'"'"' > src/entrypoint/config-paths.ts && node node_modules/.bin/ts-node src/entrypoint/generate-ts.ts > /output/index.ts'

# 13. Run entrypoint TS file.
# Note that ts-node *deletes* composite option from tsconfig ( https://github.com/TypeStrong/ts-node/issues/811 , the quoted code in the issue), so all validation that various files don't reference forbidden ones is gone.
# Therefore we compile using tsc + run created JS using node.
docker run \
  --rm \
  -v "${TARGET_DIR}/:/project/:rw" \
  --entrypoint sh \
  -w /project/ \
  "${NODE_IMAGE}" \
  -c \
  'node node_modules/.bin/tsc --build && node ts_out/entrypoint > code.tf'

echo "GREAT SUCCESS!"
cat "${TARGET_DIR}/code.tf"