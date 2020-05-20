import * as config from "../../../configuration";

export const specializeConfig: <T extends config.PrefixedInfraConfiguration> ( config: T ) => T = <T>( config: T ) => config;