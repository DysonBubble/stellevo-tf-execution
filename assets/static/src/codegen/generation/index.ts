import * as api from "../../api/configuration";
import * as codegen from "../common/platforms";
import * as codegen_common from "../common/providers";
import * as schema_common from "../../api/common/providers/schemas";
import { PathReporter } from "io-ts/lib/PathReporter";

export const GetTerraformCode = ( config: api.PrefixedInfraConfiguration ) => {

  var errorOrResult = api.PrefixedInfraConfiguration.decode( config );
  switch ( errorOrResult._tag ) {
    case 'Left':
      console.error( PathReporter.report( errorOrResult ) );
      throw Error( 'Configuration was not of correct shape.' );
    case 'Right':
      config = errorOrResult.right;
      return Object.entries( config.configuration )
        .reduce( ( curState, [resource_type, resources] ) => {
          const newDataSources: string[] = []
          const newResources: string[] = []
          const resourceSchema = api.InfraConfiguration.props[resource_type as keyof typeof api.InfraConfiguration.props].codomain as unknown as codegen_common.TResourceSchemas;
          const propGenState = CreatePropertyGenerationState( {
            indentString: "  ",
            currentIndentLevel: 0,
            addDataSourceCode: ( dataSourceCode ) => newDataSources.push( dataSourceCode )
          } );
          for ( const resource_name in resources ) {
            newResources.push( `resource "${resource_type}" "${config.prefix ?? ""}${resource_name}" ${GeneratePropertyCode( resource_type, resourceSchema, resources[resource_name], propGenState )}` )
          }

          curState.dataSources = newDataSources.reduce( ( prev, cur ) => prev + "\n" + cur, curState.dataSources );
          curState.resources = newResources.reduce( ( prev, cur ) => prev + "\n" + cur, curState.resources );
          return curState;
        }, { dataSources: "", resources: "" } );
  }
}

const GetPropertySchemas = ( resourceSchema: codegen_common.TResourceSchemas ) => {
  switch ( resourceSchema._tag ) {
    case "InterfaceType":
      return resourceSchema.props;
    case "PartialType":
      return resourceSchema.props;
    case "IntersectionType":
      return Object.assign( {}, resourceSchema.types[0].props, resourceSchema.types[1].props );
    default:
      throw new Error( 'Internal TF codegeneration error: Unrecognized resource schema kind ' + ( resourceSchema as codegen_common.TResourceSchemas )._tag );
  }
}

type PropertyGenerationState = Readonly<{
  indentString: string;
  currentIndentLevel: number;
  currentIndentString: string;
  addDataSourceCode: ( dataSourceCode: string ) => void;
}>;

const CreatePropertyGenerationState = ( info: Omit<PropertyGenerationState, "currentIndentString"> ) => {
  let curLevel = info.currentIndentLevel;
  let currentIndentString = "";
  while ( curLevel > 0 ) {
    currentIndentString += info.indentString;
    --curLevel;
  }
  return { ...info, currentIndentString };
}

const CreateChildPropertyGenerationState = ( state: PropertyGenerationState ) => CreatePropertyGenerationState( { ...state, currentIndentLevel: state.currentIndentLevel + 1 } );

const GeneratePropertyCode: ( resourceType: string, propertySchema: codegen_common.TPropertySchemas, propertyValue: unknown, state: PropertyGenerationState ) => string = ( resourceType, propertySchema, propertyValue, state ) => {
  switch ( propertySchema._tag ) {
    case "StringType":
      return `"${GetTFString( propertyValue as typeof propertySchema["_A"] )}"`;
    case "BooleanType":
      return `${propertyValue === true}`;
    case "NumberType":
      return `${+( propertyValue as any )}`;
    case "DictionaryType":
      return GenerateObjectOrBlockCode( resourceType, propertySchema, propertyValue, state, { kind: 'direct', value: propertySchema.codomain } );
    case "ArrayType":
      const arrayState = CreateChildPropertyGenerationState( state );
      const array = propertyValue as Array<unknown>;
      return `[${array.length <= 0 ? "" : `${( propertyValue as Array<unknown> ).reduce( ( prevString, item ) => {
        return `${prevString}\n${arrayState.currentIndentString}${GeneratePropertyCode( resourceType, propertySchema.type, item, arrayState )},`
      }, "" )}
${state.currentIndentString}`}]`;
    case "InterfaceType":
    case "PartialType":
    case "IntersectionType":
      return GenerateObjectOrBlockCode( resourceType, propertySchema, propertyValue, state, { kind: 'lookup', value: GetPropertySchemas( propertySchema ) } );
    case "UnionType":
      // Union is always provider-specific schema
      const schemaHandlingResult = codegen.HandleProviderSpecificSchema( resourceType, propertySchema, propertyValue );
      return schemaHandlingResult.kind === "direct" ? `${schemaHandlingResult.value}` : GeneratePropertyCode( resourceType, schemaHandlingResult.schema, schemaHandlingResult.value, state );
    default:
      throw new Error( 'Internal TF codegeneration error: Unrecognized property schema kind ' + ( propertySchema as codegen_common.TPropertySchemas )._tag );
  }
};

type TObjectPropSchemas = { kind: 'lookup', value: ReturnType<typeof GetPropertySchemas> } | { kind: 'direct', value: codegen_common.TPropertySchemas };

const GenerateObjectOrBlockCode: ( resourceType: Parameters<typeof GeneratePropertyCode>[0], propertySchema: Parameters<typeof GeneratePropertyCode>[1], propertyValue: Parameters<typeof GeneratePropertyCode>[2], state: Parameters<typeof GeneratePropertyCode>[3], propSchemas: TObjectPropSchemas ) => string = ( resourceType, propertySchema, propertyValue, state, propSchemas ) => {
  const { kvSeparator, suffix, treatKeysAsStrings } = GetPropertyIterationInfo( propertySchema );
  const actualSuffix = suffix.length > 0 ? ( "\n" + state.currentIndentString + suffix ) : suffix;
  const childState = CreateChildPropertyGenerationState( state );
  const propertyValueTyped = propertyValue as { [p: string]: unknown };
  var maxLen = Object.keys( propertyValueTyped ).reduce( ( prev, cur ) => Math.max( cur.length, prev ), 0 );
  return `${kvSeparator}${Object.entries( propertyValueTyped ).reduce( ( prevString, [key, value] ) => {
    const childSchema = propSchemas.kind === 'direct' ? propSchemas.value : propSchemas.value[key];
    const childNeedsBlock = childSchema.name === schema_common.BlockSchemaName || ( childSchema._tag === "ArrayType" && childSchema.type.name === schema_common.BlockSchemaName );
    let thisEntryString: string;
    if ( childNeedsBlock ) {
      const { iterables, blockSchema } = childSchema._tag === "ArrayType" ? { iterables: value as Array<unknown>, blockSchema: childSchema.type } : { iterables: [value], blockSchema: childSchema };
      thisEntryString = iterables.reduce<string>( ( prevPropString, blockValue ) => `${prevPropString}\n${childState.currentIndentString}${key} ${GeneratePropertyCode( resourceType, blockSchema, blockValue, childState )}\n${childState.currentIndentString}`, "" );
    } else {
      thisEntryString = `${childState.currentIndentString}${( treatKeysAsStrings ? GetTFString( key ) : key ).padEnd( maxLen, " " )} = ${GeneratePropertyCode( resourceType, childSchema, value, childState )}`;
    }
    return `${prevString}\n${thisEntryString}`;
  }, "" )}${actualSuffix}`;
};

const GetPropertyIterationInfo = ( propertySchema: codegen_common.TPropertySchemas ) => {
  const getDefaultSeparators = ( schema: codegen_common.TPropertySchemas ) => { return { kvSeparator: "=", suffix: "", treatKeysAsStrings: schema._tag === "DictionaryType" } as const; };
  const getSeparatorsForMaybeBlock = ( schema: codegen_common.TPropertySchemas ) => { return schema.name === schema_common.BlockSchemaName || schema.name === schema_common.ResourceSchemaName ? { kvSeparator: "{", suffix: "}", treatKeysAsStrings: false } as const : getDefaultSeparators( schema ); };
  switch ( propertySchema._tag ) {
    case "InterfaceType":
    case "PartialType":
    case "IntersectionType":
      return getSeparatorsForMaybeBlock( propertySchema );
    case "ArrayType":
      return getSeparatorsForMaybeBlock( propertySchema.type );
    default:
      return getDefaultSeparators( propertySchema );
  }
};

const GetTFString = ( str: string ) => str.replace( /[^$]\$\{/g, ( found ) => found.charAt( 0 ) + "$${" ); // Escape all ${ -strings which are not prefixed by $, into $${