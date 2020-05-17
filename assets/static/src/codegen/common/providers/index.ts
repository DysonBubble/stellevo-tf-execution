import * as schema from "io-ts";

export type TResourceSchemas =
  schema.TypeC<TPropertyRecord>
  | schema.PartialC<TPropertyRecord>
  | schema.IntersectionC<[schema.TypeC<TPropertyRecord>, schema.PartialC<TPropertyRecord>]>;

export type TPropertyRecord = { [k: string]: TPropertySchemas };

export type TProviderSpecificSchema = schema.UnionC<[schema.Mixed, schema.Mixed, ...Array<schema.Mixed>]>;
export type TPropertySchemas =
  schema.StringType
  | schema.BooleanType
  | schema.NumberType
  | schema.ArrayC<TPropertySchemas>
  | schema.RecordC<schema.StringType, TPropertySchemas>
  | TProviderSpecificSchema // Union can be anything 
  | TResourceSchemas;

export type SchemaHandlingResultDirect = {
  kind: "direct";
  value: string;
};
export type SchemaHandlingResultIndirect = {
  kind: "indirect";
  value: unknown;
  schema: TPropertySchemas;
};

export type SchemaHandlingResult = SchemaHandlingResultDirect | SchemaHandlingResultIndirect;