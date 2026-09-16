import { Router } from 'express';
import { authenticate } from '../auth.ts';
import type { Repository } from '../repository.ts';
import { submissionSchema } from '../schemas.ts';
import { canManageForm, param, validate } from './helpers.ts';
import { formDefinitionSchema } from '../../src/app/shared/model/model-validator.ts';
import { uuid } from '../../src/app/shared/model/ids.ts';

export function formsRoutes(repository: Repository): Router {
  const router = Router();

  router.get('/', authenticate(repository), async (req, res) =>
    res.json(
      req.user!.role === 'admin'
        ? await repository.allForms()
        : await repository.forms(req.user!.id),
    ),
  );

  // Public by id: existing share links stay usable without revealing the form catalogue.
  router.get('/:id', async (req, res) => {
    const item = await repository.form(param(req, 'id'));
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item.form);
  });

  router.post('/', authenticate(repository), async (req, res) => {
    const form = validate(formDefinitionSchema, req.body, res);
    if (!form) return;
    form.id = uuid();

    res.status(201).json(await repository.saveForm(req.user!.id, form));
  });

  router.put('/', authenticate(repository), async (req, res) => {
    const form = validate(formDefinitionSchema, req.body, res);
    if (!form) return;
    const existing = await repository.form(form.id);
    if (existing && !canManageForm(existing.ownerId, req))
      return res.status(403).json({ error: 'not form owner' });
    res
      .status(existing ? 200 : 201)
      .json(await repository.saveForm(existing?.ownerId ?? req.user!.id, form));
  });

  router.delete('/:id', authenticate(repository), async (req, res) => {
    const item = await repository.form(param(req, 'id'));
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!canManageForm(item.ownerId, req)) return res.status(403).json({ error: 'not form owner' });
    await repository.deleteForm(item.form.id);
    res.status(204).end();
  });

  router.get('/:id/submissions', authenticate(repository), async (req, res) => {
    const item = await repository.form(param(req, 'id'));
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!canManageForm(item.ownerId, req)) return res.status(403).json({ error: 'not form owner' });
    res.json(await repository.submissions(item.form.id));
  });

  router.post('/:id/submissions', async (req, res) => {
    const submission = validate(submissionSchema, req.body, res);

    if (!submission) return;
    if (submission.formId !== param(req, 'id')) {
      return res.status(422).json({ error: 'submission must match the form id' });
    }
    if (!(await repository.form(submission.formId)))
      return res.status(404).json({ error: 'not found' });
    await repository.addSubmission(submission);
    res.status(201).json(submission);
  });

  router.delete('/:id/submissions', authenticate(repository), async (req, res) => {
    const item = await repository.form(param(req, 'id'));
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!canManageForm(item.ownerId, req)) return res.status(403).json({ error: 'not form owner' });
    await repository.clearSubmissions(item.form.id);
    res.status(204).end();
  });

  router.delete('/:id/submissions/:submissionId', authenticate(repository), async (req, res) => {
    const item = await repository.form(param(req, 'id'));
    if (!item) return res.status(404).json({ error: 'not found' });
    if (!canManageForm(item.ownerId, req)) {
      return res.status(403).json({ error: 'not form owner' });
    }
    if (!(await repository.deleteSubmission(item.form.id, param(req, 'submissionId')))) {
      return res.status(404).json({ error: 'not found' });
    }
    res.status(204).end();
  });

  return router;
}
