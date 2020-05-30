export const GenerateSrcTSConfig = ( dependantPlatforms: ReadonlyArray<string> ) => ( {
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

export const GenerateTSConfig = (platformName: string) => ({
  "extends": "../../../tsconfig.project.json",
  "include": [
    "./index.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "outDir": "../../../ts_out"
  },
  "references": [{ "path": `../../platforms-src/${platformName}` }]
});

export const GenerateTS = (platformName: string, filePaths: ReadonlyArray<string>) => `
${filePaths.reduce((prev, cur) => `${prev}export * from "../../platforms-src/${platformName}/${cur.substr( 0, cur.lastIndexOf( '.ts' ) )}";
`, "")}`;