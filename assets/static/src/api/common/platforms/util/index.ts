import * as config from "../../../configuration";

// TODO this is actually not working as good as it should. Need to think something else to replace this.
export const specializeConfig: <T extends config.TerraformConfiguration> ( config: T ) => T = <T>( config: T ) => config;