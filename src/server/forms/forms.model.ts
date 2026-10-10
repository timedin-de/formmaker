import { type FormDefinition as _FormDefinition } from '@shared/model';

// Server only override, which allows changing readonly fields
export type FormDefinition = Writeable<_FormDefinition>;

type Writeable<T> = { -readonly [P in keyof T]: T[P] };
