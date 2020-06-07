import * as prepare from "./prepare/index";
import * as codegen from "./codegen/index";
import * as common from "./common/index";
import * as schema from "io-ts";
import { PathReporter } from "io-ts/lib/PathReporter";
import * as process from "process";

const Main = async () => {
  // Read environment variable "STELLEVO_ACTIONS" as array of string literals
  const actions = schema.array(schema.keyof({ "copy": "copy", "init": "init", "generate": "generate"}, "action"), "actions").decode( JSON.parse( process.env.STELLEVO_ACTIONS ?? ""));
  switch ( actions._tag ) {
    case 'Left':
      console.error( PathReporter.report( actions ) );
      throw Error( `Invalid actions supplied.` );
    case 'Right':
      const args = {
        configRepoDir: "/config",
        targetDir: "/output",
        rootDir: "/project",
        cacheDir: "/output/stellevo_cache"
      };
      for (const action of [... new Set<string>(actions.right)]) { // Make array unique
        console.log(`Processing action "${action}".`);
        switch (action) {
          case "copy":
          case "init":
            const includeCodeGenResources = action === "init";
            await prepare.CopyRequiredComponentsToTarget({ ...await prepare.DownloadRequiredComponentsToCache(args), includeCodeGenResources } );
            await codegen.GenerateCodeFiles({ ...args, includeCodeGenResources });
            break;
          case "generate":
            // Run the entrypoint via child process. Do not use await import(...), as that will not do TS compilation (needed to make sure there are no rogue references to files which are not allowed)
            // Also note that ts-node *deletes* composite option from tsconfig ( https://github.com/TypeStrong/ts-node/issues/811 , the quoted code in the issue), so all validation that various files don't reference forbidden ones is gone.
            // Therefore we compile using tsc + run created JS using node.
            const workingDir = `${args.targetDir}`;
            await common.ExecProcessAndLog("npm", ["install"], workingDir);
            await common.ExecProcessAndLog("node", ["node_modules/.bin/tsc", "--build"], workingDir);
            await common.mkdir(`${workingDir}/tf_out`, { recursive: true });
            await common.ExecProcessAndLog("node", ["--unhandled-rejections=strict", "--experimental-specifier-resolution=node", "ts_out/entrypoint"], workingDir); // TODO customize whether we should create .json files here.
            break;
        }
      }
  }
}

Main();