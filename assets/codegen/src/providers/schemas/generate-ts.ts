import * as collectedPlatformProviders from "../providers";
import * as common from "./common";

export const GenerateCommonPlatformResourcesCode = ( allPlatformProviders: ReadonlyArray<string> ) => `// This file was auto-generated by TS script!

${allPlatformProviders.reduce( ( prevString, provider ) => `${prevString}
import * as ${ provider} from "${common.GetPathFromProviderName( provider, "/inputs" )}";`, "" )}

export const AllSchemas = {${ allPlatformProviders.reduce( ( prevString, provider ) => `${prevString}
  ...${provider}.AllSchemas`, "" )}
} as const;
`

console.log( GenerateCommonPlatformResourcesCode( collectedPlatformProviders.allProviders ) );