export const GenerateTSConfig = ( allPlatforms: ReadonlyArray<string> ) => ( {
  "extends": "../../../tsconfig.project.json",
  "include": [
    "./*.ts",
    "./**/*.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "outDir": "../../../ts_out"
  },
  "references": [{ "path": "../../api/configuration" }, ...allPlatforms.map( ( platform ) => ( { "path": GetPathFromPlatformName( platform ) } ) )]
} )

const GetPathFromPlatformName = ( name: string ) => `../../platforms/${name}`;

