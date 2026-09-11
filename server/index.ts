import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.ts';
import type { FormDefinition } from '../src/app/shared/model/form.model';
import type { Submission } from '../src/app/shared/model/submission.model';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // file uploads and signatures arrive as data URLs

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/forms', (_req, res) => {
  res.json(store.getForms());
});

app.get('/api/forms/:id', (req, res) => {
  const form = store.getForm(req.params.id);
  if (!form) return res.status(404).json({ error: 'not found' });
  res.json(form);
});

app.post('/api/forms', (req, res) => {
  const form = req.body as Partial<FormDefinition> | undefined;
  if (!form || typeof form.id !== 'string' || typeof form.name !== 'string') {
    return res.status(400).json({ error: 'form must have an id and a name' });
  }
  res.status(201).json(store.saveForm(form as FormDefinition));
});

app.delete('/api/forms/:id', (req, res) => {
  store.deleteForm(req.params.id);
  res.status(204).end();
});

app.get('/api/forms/:id/submissions', (req, res) => {
  res.json(store.getSubmissionsFor(req.params.id));
});

app.post('/api/forms/:id/submissions', (req, res) => {
  const sub = req.body as Partial<Submission> | undefined;
  if (!sub || typeof sub.id !== 'string' || sub.formId !== req.params.id) {
    return res.status(400).json({ error: 'submission must match the form id' });
  }
  res.status(201).json(store.addSubmission(sub as Submission));
});

app.delete('/api/forms/:id/submissions', (req, res) => {
  store.clearSubmissions(req.params.id);
  res.status(204).end();
});

app.delete('/api/forms/:id/submissions/:submissionId', (req, res) => {
  store.deleteSubmission(req.params.id, req.params.submissionId);
  res.status(204).end();
});

// Production: serve the built Angular app with an SPA fallback.
const dist = path.join(root, 'dist/form-maker/browser');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`FormMaker API listening on http://localhost:${PORT}`);
});
