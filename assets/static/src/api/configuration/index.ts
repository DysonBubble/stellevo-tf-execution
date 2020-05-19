import * as platform_schemas from "../common/platforms/schemas";
import * as schema from "io-ts";

export const InfraConfiguration = schema.partial( platform_schemas.AllSchemas );
export type InfraConfiguration = schema.TypeOf<typeof InfraConfiguration>;

// This is the type accepted by code generator
export const PrefixedInfraConfiguration = schema.intersection( [
  schema.type( {
    configuration: InfraConfiguration
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