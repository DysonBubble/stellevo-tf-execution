export const GenerateTypeScript = ( allConfigFilePaths: ReadonlyArray<string> ) => `// This file was auto-generated by TS script!

import * as codegen from "../codegen/generation";
import * as api from "../api/configuration";
import { PathReporter } from "io-ts/lib/PathReporter";
import * as fs from 'fs/promises';

// Few helpers
const checkOrThrow = ( path: string, value: unknown ) => {
  const errorOrResult = api.PrefixedInfraConfigurationArray.decode( value );
  switch ( errorOrResult._tag ) {
    case 'Left':
      console.error( PathReporter.report( errorOrResult ) );
      throw Error( \`Dynamic configuration export in file "\${ path }" was not of correct shape.\` );
    case 'Right':
      return errorOrResult.right;
  }
}

const getArray = ( filePath: string, config: api.InfraConfigurationExport ) => checkOrThrow( filePath, typeof config === 'function' ? config() : config );

const WriteIfNeeded = async (path: string, contentString: string) => {
  let exists = false;
  try {
    await fs.access(path);
    exists = true;
  } catch {
    
  }

  if (!exists || (await fs.readFile(path, "utf-8")) !== contentString) {
    await fs.writeFile(path, contentString, "utf-8");
  }
};

type ResourcesOrDataSourcesSimplified = {[res_type: string]: {[res_id: string]: unknown} | undefined};

const MergeResourcesOrDataSources = (existing: ResourcesOrDataSourcesSimplified, current: ResourcesOrDataSourcesSimplified | undefined, prefix: string, schemaProps: object ) => {
  for (const resType in current) {
    if (current.hasOwnProperty(resType) && schemaProps.hasOwnProperty(resType)) {
      const resTypeKey = resType as keyof api.ResourceConfiguration;
      const thisTypeResources = current[resTypeKey];
      for (const resName in thisTypeResources) {
        if (thisTypeResources.hasOwnProperty(resName)) {
          const resource = thisTypeResources[resName];
          let existingTypeResources = existing[resTypeKey];
          if (!existingTypeResources) {
            existingTypeResources = {};
            (existing as any)[resTypeKey] = existingTypeResources;
          }
          existingTypeResources[\`\${prefix}\${resName}\`] = resource;
        }
      }
    }
  }

  return existing;
};

// Async main function
const Main = async () => {
  const fullCodeGenResult = [${allConfigFilePaths.reduce( ( prevString, configFilePath ) => `${prevString}
    ...getArray("${configFilePath}", (await import("${GetPathFromConfigFilePath( configFilePath.substr( 0, configFilePath.lastIndexOf( '.ts' ) ) )}")).Configuration),`, "" )}
  ].map( ( config ) => [config, codegen.GetTerraformCode( config )] as const )
  .reduce<{ resources: string, dataSources: string, resourcesJson: ResourcesOrDataSourcesSimplified, dataSourcesJson: ResourcesOrDataSourcesSimplified}>( ( prev, [config, codeGenResult] ) => (
    { resources: codegen.appendWithNewLine(prev.resources, codeGenResult.resources), dataSources: codegen.appendWithNewLine(prev.dataSources, codeGenResult.dataSources), resourcesJson: MergeResourcesOrDataSources(prev.resourcesJson, config.configuration.resources, config.prefix ?? "", api.ResourceConfiguration.props ), dataSourcesJson: MergeResourcesOrDataSources(prev.dataSourcesJson, config.configuration.data_sources, config.prefix ?? "", api.DataSourceConfiguration.props ) }
    ), { resources: "", dataSources: "", resourcesJson: {}, dataSourcesJson: {}} );

  await Promise.all( [
    WriteIfNeeded( "./tf_out/resources.tf", fullCodeGenResult.resources ),
    WriteIfNeeded( "./tf_out/data_sources.tf", fullCodeGenResult.dataSources ),
    WriteIfNeeded( "./tf_out/resources.json", JSON.stringify( fullCodeGenResult.resourcesJson, undefined, 2 ) ),
    WriteIfNeeded( "./tf_out/data_sources.json", JSON.stringify( fullCodeGenResult.dataSourcesJson, undefined, 2 ) ),
  ] );
};

// Start async main function
Main();
`
const GetPathFromConfigFilePath = ( name: string ) => `../config/exports/${name}`;

