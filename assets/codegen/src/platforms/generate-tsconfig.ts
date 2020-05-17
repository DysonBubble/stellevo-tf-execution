import * as dependantPlatformImport from "./platforms";

export const GenerateCommonPlatformTSConfig = ( dependantPlatforms: ReadonlyArray<string> ) => ( {
  "extends": "../../../tsconfig.project.json",
  "include": [
    "./*.ts",
    "./**/*.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "outDir": "../../../ts_out"
  },
  "references": [{ "path": "../../api/common/platforms" }] // allPlatformProviders.map( ( provider ) => ( { "path": common.GetPathFromProviderName( provider, "" ) } ) )
} )

console.log( JSON.stringify( GenerateCommonPlatformTSConfig( [...new Set<string>( dependantPlatformImport.dependantPlatforms )] ), undefined, 2 ) );