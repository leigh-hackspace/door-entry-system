// type DataFieldType = "string" | "number" | "boolean" | "date" | "object" | "unknown" | readonly string[];

// type TypeToString<T> = T extends string ? "string"
//   : T extends number ? "number"
//   : T extends boolean ? "boolean"
//   : T extends Date ? "date"
//   : T extends object ? "object"
//   : "unknown";

// type StringToType<T> = T extends "string" ? string
//   : T extends "number" ? number
//   : T extends "boolean" ? boolean
//   : T extends "date" ? Date
//   : T extends ReadonlyArray<infer TPicklist> ? TPicklist
//   : T extends "object" ? object
//   : never;

// export interface DataField<TType extends DataFieldType = DataFieldType> {
//   type: TType;
//   select: boolean;
//   create: boolean;
//   update: boolean;
// }

// // Extract the field filtering logic
// export type FieldsWithSelect<TFields extends Record<string, DataField>> = PickOfValue<TFields, { select: true }>;

// type FieldsWithCreate<TFields extends Record<string, DataField>> = PickOfValue<TFields, { create: true }>;

// type FieldsWithUpdate<TFields extends Record<string, DataField>> = PickOfValue<TFields, { update: true }>;

// // Extract the schema mapping logic
// type FieldToSchema<T extends DataField> = v.BaseSchema<
//   StringToType<T["type"]>,
//   StringToType<T["type"]>,
//   v.BaseIssue<unknown>
// >;

// type FieldsToSchemaObject<TFields extends Record<string, DataField>> = {
//   [P in keyof TFields]: FieldToSchema<TFields[P]>;
// };

// export type FieldsToObject<TFields extends Record<string, DataField>> = {
//   [P in keyof TFields]: StringToType<TFields[P]["type"]>;
// };

// interface RowData<TRow> {
//   rows: readonly TRow[];
//   total: number;
// }

// export type SearchArgs = Pagination & Search;

// export abstract class DataModel<
//   TFields extends Record<string, DataField>,
//   TSelect extends FieldsToObject<FieldsWithSelect<TFields>>,
// > {
//   public abstract getCreateSchema(): v.ObjectSchema<
//     FieldsToSchemaObject<FieldsWithCreate<TFields>>,
//     undefined
//   >;

//   public abstract getUpdateSchema(): v.SchemaWithPartial<
//     v.ObjectSchema<FieldsToSchemaObject<FieldsWithUpdate<TFields>>, undefined>,
//     undefined
//   >;

//   public abstract search(session: Session, args: SearchArgs): Promise<RowData<TSelect>>;

//   public abstract getOne(session: Session, id: string): Promise<TSelect>;

//   public abstract create(session: Session, data: v.InferOutput<ReturnType<this["getCreateSchema"]>>): Promise<string>;

//   public abstract update(session: Session, id: string, data: v.InferOutput<ReturnType<this["getUpdateSchema"]>>): Promise<void>;

//   public abstract delete(session: Session, ids: string[]): Promise<void>;

//   protected assertRole(session: Session, roles: UserRole[]) {
//     assert(roles.includes(session.user.role), `Must be role of ["${roles.join('","')}"]. You are "${session.user.role ?? "Anon"}."`);
//   }
// }

// export function getRouter<
//   TFields extends Record<string, DataField>,
//   TSelect extends FieldsToObject<FieldsWithSelect<TFields>>,
// >(dataModel: DataModel<TFields, TSelect>, _fields: TFields) {
//   return tRPC.router({
//     Search: tRPC.ProtectedProcedure.input(v.parser(v.intersect([PaginationSchema, SearchSchema]))).query(async ({ ctx, input }) => {
//       return dataModel.search(ctx.session, input);
//     }),

//     GetOne: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
//       return dataModel.getOne(ctx.session, input);
//     }),

//     Create: tRPC.ProtectedProcedure.input(v.parser(dataModel.getCreateSchema())).mutation(async ({ ctx, input }) => {
//       return dataModel.create(ctx.session, input!);
//     }),

//     Update: tRPC.ProtectedProcedure.input(v.parser(withId(dataModel.getUpdateSchema()))).mutation(async ({ ctx, input: [id, fields] }) => {
//       return dataModel.update(ctx.session, id, fields);
//     }),

//     Delete: tRPC.ProtectedProcedure.input(RowSelection).mutation(async ({ ctx, input: { ids } }) => {
//       return dataModel.delete(ctx.session, ids);
//     }),
//   });
// }
