import type { FormControl } from '@angular/forms';
import type { ElementDefinition } from '@shared/model/form.model';
import type { SubmissionCreate } from '@shared/model/submission.model';

/** A page of the running form with view refs for its root elements. */
export interface RunnerPage {
  id: string;
  title: string;
  subtitle: string;
  index: number;
  visible: boolean;
  elements: ElementViewRef[];
}

/** Evaluated view of one element, bound to its control. */
export interface ElementViewRef {
  id: string;
  el: ElementDefinition;
  label: string;
  description: string;
  visible: boolean;
  placeholder?: string;
  control: FormControl;
  /** View refs of a group's children; empty for every other element. */
  children: ElementViewRef[];
}

export interface SubmissionResult {
  submission: SubmissionCreate;
  visibleAnswerKeys: string[];
}
