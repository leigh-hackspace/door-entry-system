export type UndefinedToOptional<T> =
  & {
    [K in keyof T as undefined extends T[K] ? never : K]: T[K];
  }
  & {
    [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
  };

type Original = {
  name: string;
  age: number | undefined;
  email: string | undefined;
  active: boolean;
  role: string | null | undefined;
};

type Transformed = UndefinedToOptional<Original>;
