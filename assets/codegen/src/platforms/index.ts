export const GenerateTSConfig = ( dependantPlatforms: ReadonlyArray<string> ) => ( {
  "extends": "../../../tsconfig.project.json",
  "include": [
    "./*.ts",
    "./**/*.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "outDir": "../../../ts_out"
  },
  "references": [{ "path": "../../api/common/platforms/util" }] // TODO this will have references to dependant platforms once that feature is supported.
} );
