import * as configFilePathImport from "./config-paths";

export const GenerateCommonPlatformResourcesCode = ( allConfigFilePaths: ReadonlyArray<string> ) => `// This file was auto-generated by TS script!

import * as codegen from "../codegen/generation";
import * as api from "../api/configuration";
import { PathReporter } from "io-ts/lib/PathReporter";
import * as fs from 'fs/promises';

// Few helpers
const checkOrThrow = ( path: string, value: unknown ) => {
  var errorOrResult = api.PrefixedInfraConfigurationArray.decode( value );
  switch ( errorOrResult._tag ) {
    case 'Left':
      console.error( PathReporter.report( errorOrResult ) );
      throw Error( \`Dynamic configuration export in file \${ path } was not of correct shape.\` );
    case 'Right':
      return errorOrResult.right;
  }
}

const getArray = ( filePath: string, config: api.InfraConfigurationExport ) => checkOrThrow( filePath, typeof config === 'function' ? config() : config );

const appendWithNewLine = ( prev: string, cur: string ) => cur.length <= 0 ? prev : \`\${prev}\${cur.trim()}\\n\`;

// Async main function
const main = async () => {
  const fullCodeGenResult = [${allConfigFilePaths.reduce( ( prevString, configFilePath ) => `${prevString}
    ...getArray("${configFilePath}", (await import("${GetPathFromConfigFilePath( configFilePath )}")).Configuration),`, "" )}
  ].map( ( config ) => codegen.GetTerraformCode( config ) )
    .reduce( ( prev, codeGenResult ) => ( { resources: appendWithNewLine(prev.resources, codeGenResult.resources), dataSources: appendWithNewLine(prev.dataSources, codeGenResult.dataSources) } ), { resources: "", dataSources: "" } );

  await Promise.all( [
    fs.writeFile( "./tf_out/resources.tf", fullCodeGenResult.resources ),
    fs.writeFile( "./tf_out/data_sources.tf", fullCodeGenResult.dataSources )
  ] );
};

// Start async main function
main();
`
export const GetPathFromConfigFilePath = ( name: string ) => `../config/exports/${name}`;

console.log( GenerateCommonPlatformResourcesCode( configFilePathImport.allConfigFilePaths.map( path => path.substr( 0, path.lastIndexOf( '.ts' ) ) ) ) ); // Doing stuff like x.substr(0, x.lastIndexOf) is pain in Bash, so just do it here.
