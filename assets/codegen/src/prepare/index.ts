import * as common from "../common/index";
import * as url from "url";
import * as extract from "extract-zip";
import * as paths from "path";

export const DownloadRequiredComponentsToCache = async (args: Parameters<typeof PreparePlatformsAndProviders>[0] ) => {
  return await PreparePlatformsAndProviders(args);
}

export const CopyRequiredComponentsToTarget = async ( prepareInfo: DePromisify<ReturnType<typeof DownloadRequiredComponentsToCache>> & { includeCodeGenResources: boolean }) => {
  const {assetsDir, targetDir, configRepoDir, platforms, providers, includeCodeGenResources } = prepareInfo;

  const nonCodeGenRegexps = [
    /^\/tsconfig[^\/]*\.json$/,
    /^\/src$/,
    /^\/src\/api/,
  ];

  const staticSrcDir = `${assetsDir}/static`;

  await Promise.all([
    common.CopyDirectoryPreserveTimestamps({ src: staticSrcDir, dst: targetDir, includeEntry: includeCodeGenResources ? undefined : ((entry, srcPath, dstPath) => nonCodeGenRegexps.some((regex) => regex.test(srcPath.substr(staticSrcDir.length))))}),
    ...Object.entries(platforms).map(async ([platformName, platformInfo]) => {
      await common.CopyDirectoryPreserveTimestamps({src: `${platformInfo.platformLocation}/api/src`, dst: `${targetDir}/src/platforms-src/${platformName}`})
    }),
    ...Object.entries(providers).map(async ([providerName, providerInfo]) => {
      await Promise.all([
        await common.CopyDirectoryPreserveTimestamps({src: `${providerInfo.localPath}/api`, dst: `${targetDir}/src/api/providers/${providerName}`}),
        ...( includeCodeGenResources ? [ await common.CopyDirectoryPreserveTimestamps({src: `${providerInfo.localPath}/codegen`, dst: `${targetDir}/src/codegen/providers/${providerName}`}) ] : [] ),
      ])
    }),
    ...( [  ] ) // TODO copy config exports + libs if needed (src dir is not dst dir)
  ]);
}

type DePromisify<T> = T extends Promise<infer U> ? U : never;

const PreparePlatformsAndProviders = async (args: Readonly<{rootDir: string, configRepoDir: string, targetDir: string, cacheDir: string}>) => {
  const { rootDir, configRepoDir, targetDir, cacheDir } = args;
  // Read all provider overrides from config repo
  const providerOverrideDir = `${configRepoDir}/versions/providers`;
  const readOverrideContents: (kind: ProviderOverrideInfo["kind"], prefix: string, name: string) => Promise<ProviderOverrideInfo> = async (kind, prefix, name) => ({kind, provider: common.TrimCustomEnd(prefix, "/"), value: await common.ReadFileContentsAndTrim(`${providerOverrideDir}/${prefix}${name}`)});
  const overridenProviders = (await common.ReadFilesRecursively( providerOverrideDir, (prefix, entry, depth) => depth === 1 && entry.isFile() ? ( entry.name === "version.txt" ? { action: "include", result: readOverrideContents("version", prefix, entry.name)} : (entry.name === "location.txt" ?  { action: "include", result: readOverrideContents("location", prefix, entry.name) } : { action: "stop" })) : (depth < 1 && entry.isDirectory() ? { action: "recurse" } : { action: "stop" })))
    .reduce((prev, cur) => {
      const existing = prev[cur.provider];
      if (existing) {
        existing[cur.kind === "version" ? "versionOverride" : "locationOverride"] = cur.value;
      } else {
        prev[cur.provider] = { [cur.kind === "version" ? "versionOverride" : "locationOverride"]: cur.value};
      }
      return prev;
    }, {} as {[p: string]: CombinedProviderOverrideInfo});

  const platformsRoot = `${configRepoDir}/platforms`;
  const platformNames = await common.ReadDirectoriesAsSet(platformsRoot);
  const platformInfos = await Promise.all(platformNames.map((platformName: string) => GetPlatformInformation(cacheDir, platformsRoot, platformName)));
  const providers = (await Promise.all(platformInfos.map(async (platformInfo) => {
    return {
      platformInfo,
      providerInfos: await Promise.all((await common.ReadDirectoriesAsSet(`${platformInfo.platformLocation}/providers`)).map((providerName) => GetProviderInformation(platformInfo.platformLocation, providerName)))
    };
  }))).reduce((retVal, platformInfo) => {
    const { platformName } = platformInfo.platformInfo;
    platformInfo.providerInfos.forEach((providerInfo => {
      const { providerName, providerLocation, providerVersion } = providerInfo;
      const prevInfo = retVal[providerName];
      if (prevInfo ) {
        if (prevInfo.location !== providerLocation) {
          LogOverrideOrConflict(providerName, platformName, providerLocation, prevInfo.location, prevInfo.originatingPlatform, prevInfo.locationOverridden);
        } else if (prevInfo.version !== providerVersion) {
          LogOverrideOrConflict(providerName, platformName, providerVersion, prevInfo.version, prevInfo.originatingPlatform, prevInfo.versionOverridden);
        }
      } else {
        const overrideInfo = overridenProviders[providerName];
        retVal[providerName] = {
          originatingPlatform: platformName,
          location: overrideInfo?.locationOverride ?? providerLocation,
          version: overrideInfo?.versionOverride ?? providerVersion,
          locationOverridden: overrideInfo?.locationOverride !== undefined,
          versionOverridden: overrideInfo?.versionOverride !== undefined
        };
      }
    }))
    
    return retVal;
  }, {} as {[p: string]: { originatingPlatform: string, location: string, version: string, versionOverridden: boolean, locationOverridden: boolean}});

  // Download providers as needed
  return {
    assetsDir: `${rootDir}/assets`,
    targetDir,
    configRepoDir,
    platforms: platformInfos.reduce((prev, cur) => { prev[cur.platformName] = cur; return prev}, {} as {[p: string]: (typeof platformInfos)[number]}),
    providers: Object.fromEntries(await Promise.all(Object.entries(providers).map(async ([providerName, providerInfo]) => {
      const { location, version } = providerInfo;
      let newLocation = location;
      if ((url.parse(location).protocol?.length ?? 0) > 0) {
        newLocation = `${cacheDir}/providers/${providerName}/${version}/provider.zip`;
        if (await common.CheckExists(newLocation)) {
          // The file was downloaded previously -> set location to directory in order to skip zip extraction
          newLocation = paths.dirname(newLocation);
        } else {
          // Use curl (because it automatically follows redirects and such) to download URL
          console.log(`Downloading provider "${providerName}" from "${location}"...`);
          await common.mkdir(paths.dirname(newLocation), {recursive: true});
          await common.ExecProcessAndLog("curl", ["-sSL", "--output", newLocation, location]);
          console.log(`Done downloading provider "${providerName}".`);
        }
      }
  
      if ((await common.stat(newLocation)).isFile()) {
        // Assume that this is zip file, either downloaded from original URL, or specified explicitly, and extract it to directory
        const locationDir = paths.dirname(newLocation);
        await extract(newLocation, { dir: locationDir });
        newLocation = locationDir;
      } // TODO if the target is directory, then build the provider locally using "docker build ..." command.
    
      return [providerName, { ...providerInfo, localPath: `${newLocation}/outputs`}] as const;
    })))
  };
}

type ProviderOverrideInfo = {
  kind: "version" | "location";
  provider: string;
  value: string;
};

type CombinedProviderOverrideInfo = {
  locationOverride?: string | undefined;
  versionOverride?: string | undefined;
}

const GetPlatformInformation = async (cacheDir: string, platformsRoot: string, platformName: string) => {
  const platformInfoDir = `${platformsRoot}/${platformName}/`
  const originalPlatformLocation = await common.ReadFileContentsAndTrim(`${platformInfoDir}location.txt`);
  let platformLocalLocation = originalPlatformLocation;
  let platformVersion = await common.ReadFileContentsAndTrim(`${platformInfoDir}version.txt`);
  if ((url.parse(platformLocalLocation).protocol?.length ?? 0) > 0) {
    // Location was URL so use git to clone repository. Notice that we go here even if url has file as protocol, this means git repo on local filesystem.
    platformLocalLocation = `${cacheDir}/platforms/${platformName}/${platformVersion}`;
    if (!(await common.CheckExists(platformLocalLocation))) {
      console.log(`Cloning platform "${platformName}" at version "${platformVersion}"...`);
      await common.ExecProcessAndLog("git", ["clone", "--recursive", "--depth", "1", "--branch", platformVersion, originalPlatformLocation, platformLocalLocation]);
      console.log(`Done cloning platform "${platformName}".`);
    }
  }

  return {
    platformName,
    originalPlatformLocation,
    platformLocation: platformLocalLocation,
    platformVersion
  };
};


const GetProviderInformation = async (platformLocation: string, providerName: string) => {
  const providerDir = `${platformLocation}/providers/${providerName}`;
  const providerVersion = await common.ReadFileContentsAndTrim(`${providerDir}/version.txt`);
  const providerLocationPath = `${providerDir}/location.txt`;
  return {
    providerName,
    providerVersion,
    providerLocation: (await common.CheckExists(providerLocationPath)) ? (await common.ReadFileContentsAndTrim(providerLocationPath)) : `https://github.com/DysonBubble/stellevo-tf-provider-${providerName}/releases/download/${providerVersion}/provider.zip`
  };
};

const LogOverrideOrConflict = (providerName: string, providerValue: string, platformName: string, prevValue: string, prevPlatformName: string, valueOverridden: boolean) => {
  if (valueOverridden) {
    console.log(`Overriding version of provider "${providerName}" specified in platform "${platformName}" from "${providerValue}" to "${prevValue}".`)
  } else {
    console.warn(`Conflicting information for provider "${providerName}": specified as "${providerValue}" by platform "${platformName}", and specified as "${prevValue}" by platform "${prevPlatformName}". Compilation errors might arise because of that.`)
  }
};

const GetProviderInformationWithOverride = async (configRepoDir: string, fileNameWithinConfigRepo: string, providerName: string, platformPath: string ) => {
  const overridePath = `${configRepoDir}/versions/providers/${providerName}/${fileNameWithinConfigRepo}`;
  const hasOverride = await common.CheckExists(overridePath);
  return {
    hasOverride,
    content: await common.ReadFileContentsAndTrim(hasOverride? overridePath : platformPath )
  };
}