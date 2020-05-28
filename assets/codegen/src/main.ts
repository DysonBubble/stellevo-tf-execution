import * as fs from "fs/promises";
import { Dirent } from "fs";

import * as providers_resources from "./providers/resources";
import * as providers_schemas from "./providers/schemas";
import * as providers_cg from "./providers/codegen";
import * as platforms from "./platforms";
import * as config from "./config";
import * as ep from "./entrypoint";
import * as pkg from "./package";

// Things we need to generate:
// package.json
// ts files which aggregate schemas from all providers, and tsconfig files for them
// ts file which aggregates custom union schema handling for all providers, and tsconfig file for it
// tsconfig file for platform references (this is not yet supported)
// tsconfig file for configuration exports (src/config/exports folder)
// entrypoint ts file and tsconfig file for it.


// export const allPlatforms = [...new Set<string>(["test-platform", ])];
// export const allConfigFilePaths = [...new Set<string>(["test-folder/another.ts", "testing.ts", ])];
// export const dependantPlatforms = [...new Set<string>([])];
// export const allProviders = [...new Set<string>(["azuread", ])];

// JSON.stringify( GenerateCommonPlatformTSConfig( [...new Set<string>( dependantPlatformImport.dependantPlatforms )] ), undefined, 2 )

const IfDirExists = async (dir: string) => {
  try {
    await fs.access(dir);
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const WriteIfNeeded = async (path: string, content: unknown) => {
  let exists = false;
  try {
    await fs.access(path);
    exists = true;
  } catch {
    
  }

  const contentString = typeof content === "string" ? content : JSON.stringify( content, undefined, 2 );

  if (!exists || (await fs.readFile(path, "utf-8")) !== contentString) {
    await fs.writeFile(path, contentString, "utf-8");
  }
}

const ReadDirectoriesAsSet = async (dir: string) => [...new Set<string>((await IfDirExists(dir)).filter(e => e.isDirectory()).map(e => e.name))];

const ReadFilesAndContents = async (dir: string) => Object.fromEntries( await Promise.all( (await IfDirExists(dir)).filter(e => e.isFile()).map( async e => { const path = `${dir}/${e.name}`; return [path, await fs.readFile(path, "utf-8")] as const;}) ));

const WithPrefix = (content: string, prefix: string | undefined) => `${prefix ?? ""}${content}`;

const ReadFilesRecursively: (dir: string, fileFilter: (fileName: Dirent) => boolean, prefix?: string | undefined) => Promise<Array<string>> = async (dir: string, fileFilter, prefix?: string | undefined) => (await Promise.all((await IfDirExists(dir)).filter(e => e.isDirectory() || (e.isFile() && fileFilter(e))).map(async e => e.isFile() ? [WithPrefix(e.name, prefix)] : [...(await ReadFilesRecursively(`${dir}/${e.name}`, fileFilter, WithPrefix(`${e.name}/`, prefix)))]))).reduce((prev, cur) => { prev.push(...cur); return prev }, [] as string[]);

const ProcessProviders = async (providersDir: string) => {
  const providers = await ReadDirectoriesAsSet(providersDir);
  return [
    { path: "src/api/common/platforms/resources/index.ts", content: providers_resources.GenerateTypeScript(providers) },
    { path: "src/api/common/platforms/resources/tsconfig.json", content: providers_resources.GenerateTSConfig(providers) },
    { path: "src/api/common/platforms/schemas/index.ts", content: providers_schemas.GenerateTypeScript(providers) },
    { path: "src/api/common/platforms/schemas/tsconfig.json", content: providers_schemas.GenerateTSConfig(providers) },
    { path: "src/codegen/common/platforms/index.ts", content: providers_cg.GenerateTypeScript(providers) },
    { path: "src/codegen/common/platforms/tsconfig.json", content: providers_cg.GenerateTSConfig(providers) },
  ];
};

const ProcessPlatforms = async (platformsDir: string) => {
  const platformNames = await ReadDirectoriesAsSet(platformsDir);
  return [
      ...platformNames.map(platform => ({ path: `src/platforms/${platform}/tsconfig.json`, content: platforms.GenerateTSConfig([])})),
      { path: "src/config/exports/tsconfig.json", content: config.GenerateTSConfig(platformNames) }
  ];
};

const ProcessEntrypoint = async (configsDir: string) => {
  const configFiles = await ReadFilesRecursively(configsDir, file => file.name.endsWith(".ts"));
  return [
    { path: "src/entrypoint/index.ts", content: ep.GenerateTypeScript(configFiles)}
  ];
}

const ProcessPackageJson = async (packagesDir: string) => {
  const deps = await ReadFilesAndContents(`${packagesDir}runtime/`);
  const devDeps = await ReadFilesAndContents(`${packagesDir}dev/`);
  return [
    { path: "package.json", content: pkg.GeneratePackageJSON(deps, devDeps)}
  ];
}

const Main = async () => await Promise.all(
  (await Promise.all([
    ProcessProviders("/output/src/api/providers/"),
    ProcessPlatforms("/output/src/platforms/"),
    ProcessEntrypoint("/output/src/config/exports/"),
    ProcessPackageJson("/config/packages/")
  ]))
  .reduce((prev, cur) => { prev.push(...cur); return prev;}, [] as { path: string, content: unknown }[])
  .map(n => WriteIfNeeded(`/output/${n.path}`, n.content) )
);

Main();
