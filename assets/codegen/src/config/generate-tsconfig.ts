import * as allPlatformImport from "./platforms";

export const GenerateCommonPlatformTSConfig = ( allPlatforms: ReadonlyArray<string> ) => ( {
  "extends": "../../tsconfig.project.json",
  "include": [
    "./*.ts",
    "./**/*.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "outDir": "../../ts_out"
  },
  "references": [{ "path": "../api/configuration" }, ...allPlatforms.map( ( platform ) => ( { "path": GetPathFromPlatformName( platform ) } ) )]
} )

export const GetPathFromPlatformName = ( name: string ) => `../platforms/${name}`;

console.log( JSON.stringify( GenerateCommonPlatformTSConfig( [...new Set<string>( allPlatformImport.allPlatforms )] ), undefined, 2 ) );