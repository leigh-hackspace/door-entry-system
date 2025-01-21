import * as v from "valibot";

export type SearchResult<T> = { rows: readonly T[]; total: number };

export type EntityType = "User" | "Tag";

export interface FieldMetadata {
  [key: string]: unknown;
  icon: string;
  lookup?: EntityType;
}

export const FieldMetadata = (m: FieldMetadata) => m;

export const EmailAddress = v.pipe(
  v.string(),
  v.email("Not a valid email address"),
  v.title("Email Address"),
  v.metadata(FieldMetadata({ icon: "📧" }))
);

export const Password = (title: string, desc = "") =>
  v.pipe(v.string(), v.minLength(8), v.title(title), v.description(desc), v.metadata(FieldMetadata({ icon: "🔑" })));

export function pickPrefix<TObj extends object, TPrefix extends string>(obj: TObj, prefix: TPrefix) {
  return Object.fromEntries(Object.entries(obj).filter(([e]) => e.startsWith(prefix))) as Pick<
    TObj,
    PickPrefix<Extract<keyof TObj, string>, TPrefix>
  >;
}

type PickPrefix<S extends string, P extends string> = S extends `${P}${string}` ? S : never;

// const foo: { foo_one: number; foo_two: number } = pickPrefix({ foo_one: 1, foo_two: 2, bar_one: 1 }, "foo");

type AndCondition = {
  and: Condition[];
};

type OrCondition = {
  or: Condition[];
};

type TrueCondition = readonly [boolean, string];

type Condition = AndCondition | OrCondition | TrueCondition;

export function assertConditions(condition: Condition): { success: boolean; message: string } {
  if ("length" in condition && condition.length === 2) {
    const [expression, message] = condition;
    return {
      success: expression,
      message: `"${message}"`,
    };
  } else if ("and" in condition) {
    if (condition.and.length === 0) {
      return { success: true, message: "No conditions to evaluate" };
    }

    const ands = condition.and.map(assertConditions);

    return {
      success: !ands.some((c) => !c.success),
      message: `(Must be all of: ${ands
        .filter((c) => !c.success)
        .map((c) => `${c.message}`)
        .join(" AND ")})`,
    };
  } else if ("or" in condition) {
    if (condition.or.length === 0) {
      return { success: false, message: "No conditions to evaluate" };
    }

    const ors = condition.or.map(assertConditions);

    return {
      success: ors.some((c) => c.success),
      message: `(Must be either: ${ors
        .filter((c) => !c.success)
        .map((c) => `${c.message}`)
        .join(" OR ")})`,
    };
  }

  throw new Error("Invalid condition format");
}
