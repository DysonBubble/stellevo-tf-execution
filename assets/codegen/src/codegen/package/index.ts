export type TDependencyInfo = { [dependency: string]: string };

export const GeneratePackageJSON = ( dependencies: TDependencyInfo, devDependencies: TDependencyInfo ) => ( {
    "name": "infra-management-tf",
    "version": "0.1.0",
    "description": "This package contains TS code which can be invoked to generate TF code.",
    "dependencies": Object.assign( {
      "io-ts": "^2.2.4",
      "fp-ts": "^2.5.4"
    }, dependencies ),
    "devDependencies": Object.assign( {
      "typescript": "^3.9.3",
      "@types/node": "^14.0.3"
    }, devDependencies)
  } );
