import type { FormDefinition } from '../../shared/model/form.model';
import type { ValuesMap } from '../../shared/model/values.model';
import { catchFn } from '../../shared/helper';

const DRAFT_PREFIX = 'formmaker.draft.';

interface SavedDraft {
  savedAt: number;
  formVersion: number;
  values: ValuesMap;
}

/** Temporary localStorage autosave of a runner's in-progress answers. */
export class RunnerDraft {
  save(form: FormDefinition, values: ValuesMap): void {
    const data: SavedDraft = {
      savedAt: Date.now(),
      formVersion: form.version,
      values,
    };
    catchFn(() => localStorage.setItem(RunnerDraft.key(form), JSON.stringify(data)));
  }

  load(form: FormDefinition): ValuesMap | null {
    const { data } = catchFn(() => {
      const raw = localStorage.getItem(RunnerDraft.key(form));
      if (!raw) return null;
      const data = JSON.parse(raw) as SavedDraft;
      if (data.formVersion !== form.version || !data.values || typeof data.values !== 'object') {
        localStorage.removeItem(RunnerDraft.key(form));
        return null;
      }
      return data.values;
    });
    return data;
  }

  clear(form: FormDefinition): void {
    catchFn(() => localStorage.removeItem(RunnerDraft.key(form)));
  }

  private static key(form: FormDefinition): string {
    return DRAFT_PREFIX + form.id;
  }
}
