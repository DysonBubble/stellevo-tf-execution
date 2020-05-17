import * as schema from "io-ts";

export const SchemaString = schema.string;

export const SchemaSensitiveStringName = "sensitive_string" as const;

export const SchemaBoolean = schema.boolean;

export const SchemaInteger = schema.Integer; // Integer is deprecated, but schema.Int does not work well with schema.TypeOf

export const SchemaReal = schema.number;

export const SchemaList = schema.array;

export const SchemaSet = schema.array;

export const SchemaMap = <C extends schema.Mixed>( codomain: C, name?: string ) => schema.dictionary( schema.string, codomain, name );

export const SchemaRecord = schema.type;

//export const SchemaBlock = schema.type; // TODO diff name
export const BlockSchemaName = "BlockSchema" as const;

export const ResourceSchemaName = "ResourceSchema" as const;

export const SchemaUnion = schema.union;

export const SchemaIntersection = schema.intersection;

export const SchemaOptional = schema.partial;

export const SchemaAny = schema.any;

export const SchemaLiteral = schema.literal;

export const SchemaKeyOf = schema.keyof;

export type TypeOf<T extends schema.Any> = schema.TypeOf<T>;

// Having signature as <T extends object>(obj T, key: keyof T) => {[P in Exclude<keyof T, typeof key]: T[P]} doesn't work, because 'typeof key' will expand into 'keyof T', always resulting in empty type
//export const RemoveKey: <T extends object, U extends object>( obj: T, obj2: U ) => { [P in Exclude<keyof T, keyof U>]: T[P] } = ( obj ) => {
export const RemoveKey = <T extends object, U extends object>( obj: T, obj2: U ) => {
  return Object.entries( obj ).reduce<{ [P in Exclude<keyof T, keyof U>]: T[P] }>( ( prev, cur ) => {
    const [curProperty, curValue] = cur;
    if ( !obj2.hasOwnProperty( curProperty ) ) {
      ( prev as any )[curProperty] = curValue;
    }
    return prev;
  }, {} as any )

}

