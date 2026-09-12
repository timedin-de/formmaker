import type {
  FormDefinition,
  ElementDefinition,
  TextElement,
  LongTextElement,
  ChoiceElement,
  NumberElement,
  ScaleElement,
  FileElement,
  GroupElement,
} from '../../shared/model/form.model';
import { newForm, createPage, createElement } from './form-factory';
import { uuid } from '../../shared/model/ids';
import { emptyConditionGroup } from '../../shared/model/conditions.model';

export function buildDemoForm(): FormDefinition {
  const form = newForm('Customer onboarding');
  form.description =
    '**Full-featured example.** Shows page logic, conditional questions, piping, ' +
    'dynamic defaults, calculations, validators and a signature pad. Titles and ' +
    'descriptions support **bold**, *italic*, `code` and [links](https://example.com).';

  // ---- page 1: basics ----
  const p1 = createPage('About you');
  p1.title = 'About you';
  const name = createElement('text', 'Full name');
  name.description = '**Required.** We will echo this back to you as you fill in the form.';
  const email = createElement('text', 'Business email') as TextElement;
  email.inputType = 'email';
  email.validations = [
    { id: uuid(), rule: 'email', message: "That doesn't look like an email — please fix it." },
  ];
  email.placeholder = 'you@company.com';
  email.description =
    'Used only for your receipt — read our [privacy policy](https://example.com/privacy).';
  const doh = createElement('longText', 'Short bio') as LongTextElement;
  doh.rows = 3;
  const role = createElement('choice', 'Primary role') as ChoiceElement;
  role.options = [
    { id: uuid(), label: 'Freelancer', value: 'freelancer' },
    { id: uuid(), label: 'Small business owner', value: 'small_business' },
    { id: uuid(), label: 'Corporation', value: 'corporation' },
    { id: uuid(), label: 'Job seeking', value: 'job_seeking' },
  ];
  const companySize = createElement('dropdown', 'Company size') as ChoiceElement;
  companySize.options = [
    { id: uuid(), label: 'Just me', value: '1' },
    { id: uuid(), label: '2-10 people', value: '2-10' },
    { id: uuid(), label: '11-50 people', value: '11-50' },
    { id: uuid(), label: '50+ people', value: '50+' },
  ];
  const languages = createElement('multiChoice', 'Languages spoken') as ChoiceElement;
  languages.options = [
    { id: uuid(), label: 'English', value: 'en' },
    { id: uuid(), label: 'German', value: 'de' },
    { id: uuid(), label: 'Spanish', value: 'es' },
    { id: uuid(), label: 'French', value: 'fr' },
  ];
  p1.elements = [name, email, doh, role, companySize, languages];

  // ---- page 2: conditional + piping + calculations ----
  const p2 = createPage('Work details');
  p2.enabledWhen = {
    logic: 'all',
    conditions: [
      { fieldId: role.id, operator: 'neq', operand: { kind: 'literal', value: 'job_seeking' } },
    ],
    groups: [],
  };
  p2.subtitle = 'Only shown when you are **not** *job seeking* — change the role to see it appear.';
  const jobTitle = createElement('text', `What is your role at {{${companySize.id}}}?`);
  const price = createElement('number', 'Hourly/unit price');
  price.defaultValue = { kind: 'static', value: 100 };
  const hours = createElement('number', 'Monthly hours');
  hours.defaultValue = { kind: 'static', value: 120 };
  const gross = createElement('number', 'Gross monthly revenue') as NumberElement; // computed
  gross.calculation = { formula: `${price.id} * ${hours.id}`, decimals: 2 };
  gross.readonly = true;
  gross.description = '**Read-only.** Auto-calculated from price × hours (`price * hours`).';
  const note = createElement(
    'longText',
    `You are signing up for {{${role.id}}}. Leave any notes below.`,
  );
  const happy = createElement('scale', 'How happy are you with the current tool?') as ScaleElement;
  happy.min = 0;
  happy.max = 10;
  happy.step = 1;
  happy.minLabel = 'Not at all';
  happy.maxLabel = 'Very happy';
  p2.elements = [jobTitle, price, hours, gross, note, happy];

  // ---- page 3: group + signature + file ----
  const p3 = createPage('Documents');
  const team = createGroup('Team members') as GroupElement;
  team.collapsible = true;
  const m1 = createElement('text', 'Member 1 — name');
  const m2 = createElement('text', 'Member 2 — name');
  team.elements = [m1, m2];
  const cv = createElement('file', 'Upload your CV') as FileElement;
  cv.accept = '.pdf,.doc,.docx';
  cv.description = 'Accepted: `.pdf`, `.doc`, `.docx`.';
  cv.validations = [
    {
      id: uuid(),
      rule: 'fileType',
      accept: '.pdf,.doc,.docx',
      message: 'Only PDF or Word files are accepted.',
    },
  ];
  const sig = createElement('signature', 'Please sign to accept');
  sig.required = true;
  sig.description = 'Use a **clean** signature — it will be included in your PDF receipt.';
  p3.elements = [team, cv, sig];

  form.pages = [p1, p2, p3];

  // A hidden greeting uses piping to echo the applicant's name.
  const section = createElement(
    'section',
    `**Welcome aboard**, {{${name.id}}}! Register with us below.`,
  );
  form.pages[0].elements = [section, ...form.pages[0].elements];

  return form;
}

function createGroup(label: string): ElementDefinition {
  const g = createElement('group', label) as unknown as {
    type: 'group';
    collapsible: boolean;
    enabledWhen: unknown;
    elements: ElementDefinition[];
    id: string;
    label: string;
    validations: unknown;
    width: unknown;
  };
  g.collapsible = false;
  g.enabledWhen = emptyConditionGroup();
  return g as unknown as ElementDefinition;
}

export function stressForm(count = 1200): FormDefinition {
  const form = newForm('Stress test');
  const p = createPage('Many fields');
  const elements: ElementDefinition[] = [];
  for (let i = 0; i < count; i++) elements.push(createElement('text', `Question ${i + 1}`));
  p.elements = elements;
  form.pages = [p];
  return form;
}
