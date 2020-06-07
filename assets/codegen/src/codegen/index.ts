import * as common from "../common/index";
import * as providers_resources from "./providers/resources";
import * as providers_schemas from "./providers/schemas";
import * as providers_cg from "./providers/codegen";
import * as platforms from "./platforms/index";
import * as config from "./config/index";
import * as ep from "./entrypoint/index";
import * as pkg from "./package/index";

const ProcessProviders = async (providersDir: string, includeCodeGenResources: boolean) => {
  const providers = await common.ReadDirectoriesAsSet(providersDir);
  return [
    { path: "src/api/common/platforms/resources/index.ts", content: providers_resources.GenerateTypeScript(providers) },
    { path: "src/api/common/platforms/resources/tsconfig.json", content: providers_resources.GenerateTSConfig(providers) },
    { path: "src/api/common/platforms/schemas/index.ts", content: providers_schemas.GenerateTypeScript(providers) },
    { path: "src/api/common/platforms/schemas/tsconfig.json", content: providers_schemas.GenerateTSConfig(providers) },
    ... (includeCodeGenResources ? [{ path: "src/codegen/common/platforms/index.ts", content: providers_cg.GenerateTypeScript(providers) },
    { path: "src/codegen/common/platforms/tsconfig.json", content: providers_cg.GenerateTSConfig(providers) } ] : [] ),
  ];
};

const ProcessPlatforms = async (platformsDir: string) => {
  const platformNames = await common.ReadDirectoriesAsSet(platformsDir);
  return [
      ...platformNames.map(platform => ({ path: `src/platforms-src/${platform}/tsconfig.json`, content: platforms.GenerateSrcTSConfig([])})),
      ...await Promise.all(platformNames.map(async platform => ({ path: `src/platforms/${platform}/index.ts`, content: platforms.GenerateTS(platform, await common.ReadFilesRecursively(`${platformsDir}${platform}/`, IsTypeScriptFile))}))),
      ...platformNames.map(platform => ({ path: `src/platforms/${platform}/tsconfig.json`, content: platforms.GenerateTSConfig(platform)})),
      { path: "src/config/exports/tsconfig.json", content: config.GenerateTSConfig(platformNames) }
  ];
};

const ProcessEntrypoint = async (configsDir: string, includeCodeGenResources: boolean) => {
  const configFiles = await common.ReadFilesRecursively(configsDir, IsTypeScriptFile);
  return includeCodeGenResources ? [
    { path: "src/entrypoint/index.ts", content: ep.GenerateTypeScript(configFiles)}
  ] : [];
};

const ProcessPackageJson = async (packagesDir: string) => {
  const deps = await common.ReadFilesAndContents(`${packagesDir}runtime/`);
  const devDeps = await common.ReadFilesAndContents(`${packagesDir}dev/`);
  return [
    { path: "package.json", content: pkg.GeneratePackageJSON(deps, devDeps)}
  ];
};

export const GenerateCodeFiles = async (args: Readonly<{targetDir: string, configRepoDir: string, includeCodeGenResources: boolean}>) => {
  const { targetDir, configRepoDir, includeCodeGenResources } = args;
  await Promise.all(
    (await Promise.all([
      ProcessProviders(`${targetDir}/src/api/providers/`, includeCodeGenResources),
      ProcessPlatforms(`${targetDir}/src/platforms-src/`),
      ProcessEntrypoint(`${targetDir}/src/config/exports/`, includeCodeGenResources),
      ProcessPackageJson(`${configRepoDir}/packages/`)
    ]))
    .reduce((prev, cur) => { prev.push(...cur); return prev;}, [] as { path: string, content: unknown }[])
    .map(n => common.WriteIfNeeded(`${targetDir}/${n.path}`, n.content) )
  );
}

const IsTypeScriptFile: (prefix: string, entry: common.Dirent) => common.TEntryFilterResult<string> = (prefix, entry) => entry.isDirectory() ? { action: "recurse" } : ( entry.isFile() && entry.name.endsWith(".ts") ? { action: "include", result: `${prefix}${entry.name}` } : { action: "stop" } );

//Main();
