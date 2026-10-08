import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { flattenElements } from '@shared/helper';
import { type ConditionGroup } from '@shared/model';
import type { Elements, ElementType, PageDefinition } from '@shared/model/form.model';
import { first } from 'rxjs';
import { I18nService } from '../core/i18n';
import { type DesignerStore } from '../core/state/designer.store';
import { ConditionEditor } from './condition-editor';
import { canSortAt, DropDragState } from './drop-sort';
import { ElementRow } from './element-row';
import { BuilderPalette } from './palette';

/** Drop list DOM ids: groups use `dropList_<groupId>`, the page root uses `dropList_main`. */
const DROP_LIST_PREFIX = 'dropList_';
const MAIN_DROP_LIST = `${DROP_LIST_PREFIX}main`;

@Component({
  imports: [
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatToolbarModule,
    FormsModule,
    MatTooltipModule,
    ElementRow,
    ConditionEditor,
    RouterLink,
    BuilderPalette,
    CdkDropList,
    CdkDrag,
  ],
  selector: 'fm-builder-canvas',
  providers: [DropDragState],
  templateUrl: './canvas.html',
  styleUrl: './canvas.scss',
})
export class BuilderCanvas {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly i18n = inject(I18nService);
  protected readonly canEnter = inject(DropDragState).canEnter;

  readonly store = input.required<DesignerStore>();

  protected readonly canSortAt = canSortAt;
  protected readonly mainDropList = MAIN_DROP_LIST;

  protected readonly pages = computed(() => this.store().form().pages);
  protected readonly page = computed(() => this.store().activePage());
  protected readonly dropLists = computed(() => [
    ...flattenElements(this.page()?.elements ?? [])
      .filter((x) => x.type === 'group')
      .map((x) => `${DROP_LIST_PREFIX}${x.id}`),
    MAIN_DROP_LIST,
  ]);

  protected fieldOptions = computed(() =>
    this.pages()
      .flatMap((p) => p.elements)
      .filter((el) => el.type !== 'section' && el.type !== 'group')
      .map((el) => ({ id: el.id, label: el.label })),
  );

  readonly paletteDialog = viewChild<ElementRef<HTMLDialogElement>>('palette');
  readonly paleteTarget = signal<false | ((type: ElementType) => void)>(false);

  constructor() {
    effect(() => {
      const dialog = this.paletteDialog();
      if (!dialog) return;
      const el = dialog.nativeElement;
      if (!el.open && typeof el.showModal === 'function') el.showModal();
    });
  }

  clonePage(page: PageDefinition) {
    this.store().clonePage(page.id);
  }

  removePage(page: PageDefinition): void {
    this.store().removePage(page.id);
  }

  append(type: ElementType = 'text'): void {
    const page = this.store().activePage();
    if (!page) this.store().addPage();
    this.store().addElement(this.store().activePage()?.id ?? '', type);
  }

  selectPage(pageId: string) {
    this.route.queryParams.pipe(first()).subscribe((params) => {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ...params, page: pageId },
      });
    });
  }

  drop(event: CdkDragDrop<Elements, Elements, string>): void {
    const listId = event.container.id;
    const parentId = listId === MAIN_DROP_LIST ? null : listId.slice(DROP_LIST_PREFIX.length);
    this.store().moveElementTo(event.item.data, parentId, event.currentIndex);
  }
  readonly emptyGroup: () => ConditionGroup = () => ({ logic: 'all', conditions: [], groups: [] });

  onDialogClick(event: MouseEvent): void {
    const dialog = this.paletteDialog();
    if (dialog && event.target === dialog.nativeElement) this.paleteTarget.set(false);
  }

  addPage() {
    const { id } = this.store().addPage();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: id },
      queryParamsHandling: 'merge',
    });
  }
}
