import * as collectedPlatformProviders from "../providers";
import * as common from "./common";

export const GenerateCommonPlatformTSConfig = ( allPlatformProviders: ReadonlyArray<string> ) => ( {
  "extends": "../../../../../tsconfig.project.json",
  "include": [
    "./*.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "outDir": "../../../../../ts_out"
  },
  "references": allPlatformProviders.map( ( provider ) => ( { "path": common.GetPathFromProviderName( provider ) } ) )
} )

console.log( JSON.stringify( GenerateCommonPlatformTSConfig( [...new Set<string>( collectedPlatformProviders.allProviders )] ), undefined, 2 ) );