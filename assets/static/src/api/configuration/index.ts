import * as platform_schemas from "../common/platforms/schemas";
import * as schema from "io-ts";

export const ResourceConfiguration = schema.partial( platform_schemas.AllSchemas );
export type ResourceConfiguration = schema.TypeOf<typeof ResourceConfiguration>;

export const DataSourceConfiguration = schema.partial( platform_schemas.AllDataSources );
export type DataSourceConfiguration = schema.TypeOf<typeof DataSourceConfiguration>;

// This is the type accepted by code generator
export const PrefixedInfraConfiguration = schema.intersection( [
  schema.type( {
    configuration: schema.refinement( schema.partial( {
      resources: ResourceConfiguration,
      data_sources: DataSourceConfiguration
    } ), c => ( c.resources !== null && c.resources !== undefined ) || ( c.data_sources !== null && c.data_sources !== undefined ) )
  } ),
  schema.partial( {
    prefix: schema.string
  } )
] );
export type PrefixedInfraConfiguration = schema.TypeOf<typeof PrefixedInfraConfiguration>;
export const PrefixedInfraConfigurationArray = schema.readonlyArray( PrefixedInfraConfiguration );
export type PrefixedInfraConfigurationArray = schema.TypeOf<typeof PrefixedInfraConfigurationArray>;

// This is the type exported by .ts files in actual infra configuration
// <[typeof PrefixedInfraConfigurationArray, () => typeof PrefixedInfraConfigurationArray]>
export const InfraConfigurationExport = schema.union( [
  PrefixedInfraConfigurationArray,
  schema.Function
] );
export type InfraConfigurationExport = ReadonlyArray<PrefixedInfraConfiguration> | ( () => ReadonlyArray<PrefixedInfraConfiguration> ); // schema.TypeOf<typeof InfraConfigurationExport>;