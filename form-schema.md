# FormMaker Import Schema (`form.json`)

Authoritative validator: `src/shared/model/model-validator.ts` (`formDefinitionSchema`).
Import a `FormDefinition` via `parseFormData(json)`. Zod strips unknown keys; missing
optionals are defaulted. Reference validation (in `core/export/form-schema.ts`) rejects
references to element ids that don't exist. All ids are plain strings (any unique value).

## Top level

```jsonc
{
  "id": "string",          // required
  "name": "string",        // required
  "description": "string", // optional, Markdown
  "version": 1,            // number
  "schemaVersion": 1,      // literal, must be 1
  "createdAt": "…",        // optional ISO
  "updatedAt": "…",        // optional ISO
  "settings": { … },       // required
  "pages": [ … ]           // required, ≥1
}
```

### `settings` (FormSettings)

| key              | type                       | default      | notes                                                              |
| ---------------- | -------------------------- | ------------ | ------------------------------------------------------------------ |
| `name`           | string                     | –            | overrides form name                                                |
| `submitLabel`    | string                     | –            | button text                                                        |
| `showProgress`   | bool                       | –            | progress bar                                                       |
| `allowBack`      | bool                       | –            | back-navigation                                                    |
| `navigation`     | `'linear'\|'free'\|'auto'` | **required** | linear=strict order, free=jump via progress, auto=skip gated pages |
| `enableAutoSave` | bool                       | –            | local autosave                                                     |

### `pages` (PageDefinition[])

| key           | type                | notes                               |
| ------------- | ------------------- | ----------------------------------- |
| `id`          | string              | required, unique                    |
| `title`       | string              | optional                            |
| `subtitle`    | string              | optional                            |
| `enabledWhen` | ConditionGroup      | optional; false ⇒ page auto-skipped |
| `elements`    | ElementDefinition[] | required                            |

## Element common base

Every element: `id`, `type`, `label` (required); `description` (optional, Markdown),
`width` (default 1), `enabledWhen` (optional ConditionGroup).
**Questions** additionally have `required` (default false), `validations` (default []),
`readonly` (default false), `defaultValue` (default null).

- `width` = 12-column fraction: `n/12` (`1/12`…`12/12`), default `1` = full row.
- `label`, `description`, `placeholder`, validation `message`s support **piping**:
  `{{fieldId}}` or `{{fieldId | filter[:arg]}}`. Filters: `upper`, `lower`, `trim`,
  `title`, `number[:digits]`, `currency[:USD]`, `date`. Referenced fields must exist.
- `description` renders Markdown (HTML escaped).
- Back-references from a _later_ element are allowed.

## Types

### `chooseQuestion` bits shared by every question

`type` ∈ `text | longText | number | date | time | dateTime | boolean | choice | dropdown | multiChoice | scale | file | signature` (13), plus layout `group | section | textdisplay`.

| type                              | extra (required)               | extra (optional)                                                           | value stored                                   |
| --------------------------------- | ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------- |
| `text`                            | –                              | `inputType`: `text\|email\|url\|phone\|number`; `maxLength`; `placeholder` | string                                         |
| `longText`                        | –                              | `rows`; `maxLength`; `placeholder`                                         | string                                         |
| `number`                          | –                              | `min`, `max`, `step`, `unit`, `decimals`; `placeholder`                    | number                                         |
| `date`                            | –                              | `placeholder`                                                              | string (ISO `yyyy-MM-dd`)                      |
| `time`/`dateTime`                 | `timeInterval` (default 1 min) | `placeholder`                                                              | string (ISO `HH:mm` / ISO)                     |
| `boolean`                         | –                              | –                                                                          | boolean                                        |
| `choice`/`dropdown`/`multiChoice` | `options` (≥1, non-empty)      | –                                                                          | value string/number (`multiChoice` → string[]) |
| `scale`                           | `min`, `max`, `step` (numbers) | `minLabel`, `maxLabel`                                                     | number                                         |
| `file`                            | –                              | `accept`, `multiple`                                                       | FileValue[]                                    |
| `signature`                       | –                              | –                                                                          | SignatureValue                                 |
| `section`                         | –                              | –                                                                          | –                                              |
| `textdisplay`                     | –                              | –                                                                          | –                                              |
| `group`                           | `elements` (recursive array)   | `collapsible`, `defaultValue`                                              | –                                              |

`textdisplay` is a static/markdown block (uses `label`).
`group` nests any elements recursively (including other groups).

### choice `options` (choice/dropdown/multiChoice)

```jsonc
{ "id": "string", "label": "string", "value": "string | number" }
```

### `timeInterval` (time/dateTime, optional)

Granularity of the native time picker — the `step` in seconds is `value × multiplier`.

```jsonc
{ "value": 15, "multiplier": "60" } // every 15 minutes
```

`value` = whole number ≥ 1, `multiplier` ∈ `"1"` (seconds) | `"60"` (minutes) | `"3600"` (hours).
Missing on import ⇒ `{ "value": 1, "multiplier": "60" }`.

### `defaultValue` (DefaultValueDef, default null)

```jsonc
{ "kind": "static",     "value": <FieldValue> }                      // field initial value
{ "kind": "expression", "expression": "concat('Order #', q_id)" }    // computed via expression engine
{ "kind": "fromField",  "fieldId": "q_other" }                       // copy another field's value
```

`FieldValue`: `string | number | boolean | string[] | FileValue[] | SignatureValue | null`.
`FileValue`: `{name, size, mimeType, dataUrl?}`.
`SignatureValue`: `{dataUrl, width, height, mimeType:"image/png"}` (import only as static).

## Conditions (`enabledWhen`, page/option gates)

`ConditionGroup` = `{ logic: "all"|"any", conditions: Condition[], groups: ConditionGroup[] }`
(groups = OR/AND corners; empty group ⇒ always true).

`Condition`:

```jsonc
{
  "fieldId":   "q_other",                       // referenced element id (must exist)
  "fieldType": "text",                          // optional hint
  "operator":  "<op>",
  "operand":   { "kind": "literal", "value": "x" | 5 | true | null }
            |  { "kind": "field", "fieldId": "q_x" },   // compare against another field
  "operandTo": { … },                            // only for `between` (upper bound)
  "values":    ["a","b"],                        // only for in/notIn/has* (array of string|number|boolean)
}
```

| operator                 | needs                  | semantics                                                             |
| ------------------------ | ---------------------- | --------------------------------------------------------------------- |
| `eq` `neq`               | `operand`              | equal / not equal (case-insensitive; arrays match if any item equals) |
| `gt` `gte` `lt` `lte`    | `operand`              | numeric compare (falls back to string compare)                        |
| `contains` `notContains` | `operand`              | substring (case-insensitive; arrays: any item)                        |
| `startsWith` `endsWith`  | `operand`              | string prefix/suffix                                                  |
| `isEmpty` `isNotEmpty`   | –                      | empty check (null/''/empty array)                                     |
| `in` `notIn`             | `values`               | left value in / not in list                                           |
| `hasAnyOf`               | `values`               | array value intersects list                                           |
| `hasAllOf`               | `values`               | array value contains all list items                                   |
| `between`                | `operand`, `operandTo` | operand ≤ value ≤ operandTo                                           |

## Validation rules (`validations`, ValidationRule[])

Each rule: `id` (required, unique within element), `rule`, optional `message`
(pipable). Per-rule payload:

| rule                                     | payload                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `required`                               | – (redundant with `required:true`, but lets you set a message)       |
| `minLength` `maxLength`                  | `value` = number                                                     |
| `min` `max`                              | `value` = number                                                     |
| `between`                                | `value`, `valueTo` = numbers                                         |
| `pattern`                                | `pattern` = regex source                                             |
| `email` `url` `phone` `integer` `number` | –                                                                    |
| `dateMin` `dateMax`                      | `value` = date string                                                |
| `minFiles` `maxFiles` `fileSizeMaxMb`    | `value` = number (MB for fileSize)                                   |
| `fileType`                               | `accept` = comma list of extensions or MIME, e.g. `".pdf,image/png"` |
| `custom`                                 | `expression` = boolean expression; string result = failure message   |

## Expression engine (default values + custom validations)

Operators: `+ - * / % ^` , comparisons `== != ~= < <= > >=`, logic `&& || !`.
Functions: `sum avg min max count round floor ceil abs concat length lower upper trim
replace toText contains startsWith endsWith matches isEmpty isNotEmpty if coalesce now
dateDiff yearsBetween msg required`. Identifiers = field ids (null when empty).
`~=` = loose case-insensitive equality.

## Full example — every type + configuration

```json
{
  "id": "form_order",
  "name": "Order registration",
  "description": "### Setup\nFill **all** sections to complete the order.",
  "version": 1,
  "schemaVersion": 1,
  "settings": {
    "name": "Order registration",
    "submitLabel": "Send order",
    "showProgress": true,
    "allowBack": true,
    "navigation": "auto",
    "enableAutoSave": true
  },
  "pages": [
    {
      "id": "p1",
      "title": "Personal data",
      "subtitle": "Step 1 of 2",
      "elements": [
        {
          "id": "sec_main",
          "type": "section",
          "width": 1,
          "label": "",
          "description": "Primary fields"
        },
        {
          "id": "q_name",
          "type": "text",
          "label": "Full name",
          "description": "",
          "width": 1,
          "required": true,
          "readonly": false,
          "validations": [
            { "id": "v1", "rule": "minLength", "value": 2, "message": "Name too short" },
            { "id": "v2", "rule": "pattern", "pattern": "^[A-Za-z ,.'-]+$" }
          ],
          "defaultValue": { "kind": "static", "value": "Jane Doe" },
          "placeholder": "e.g. Jane Doe",
          "inputType": "text",
          "maxLength": 120
        },
        {
          "id": "q_email",
          "type": "text",
          "label": "Email",
          "width": 0.5,
          "required": true,
          "validations": [{ "id": "v3", "rule": "email" }],
          "defaultValue": { "kind": "fromField", "fieldId": "q_name" },
          "placeholder": "you@mail.com",
          "inputType": "email"
        },
        {
          "id": "q_phone",
          "type": "text",
          "label": "Phone",
          "width": 0.5,
          "validations": [
            { "id": "v4", "rule": "phone" },
            { "id": "v5", "rule": "maxLength", "value": 20 }
          ],
          "defaultValue": null,
          "placeholder": "+1 ...",
          "inputType": "phone",
          "enabledWhen": {
            "logic": "all",
            "conditions": [{ "fieldId": "q_country", "operator": "in", "values": ["US", "UK"] }],
            "groups": []
          }
        },
        {
          "id": "q_website",
          "type": "text",
          "label": "Website",
          "width": 1,
          "validations": [{ "id": "v6", "rule": "url" }],
          "defaultValue": null,
          "placeholder": "https://…",
          "inputType": "url",
          "enabledWhen": {
            "logic": "any",
            "conditions": [
              {
                "fieldId": "q_terms",
                "operator": "eq",
                "operand": { "kind": "literal", "value": true }
              }
            ],
            "groups": []
          }
        },
        {
          "id": "q_dob",
          "type": "date",
          "label": "Date of birth",
          "width": 0.5,
          "required": true,
          "validations": [
            { "id": "v7", "rule": "dateMin", "value": "1900-01-01" },
            { "id": "v8", "rule": "dateMax", "value": "2010-12-31" }
          ],
          "defaultValue": { "kind": "expression", "expression": "now()" },
          "placeholder": "yyyy-mm-dd"
        },
        {
          "id": "q_time",
          "type": "time",
          "label": "Preferred call time",
          "width": 0.5,
          "defaultValue": { "kind": "static", "value": "14:30" },
          "timeInterval": { "value": 15, "multiplier": "60" },
          "placeholder": "HH:mm"
        },
        {
          "id": "q_when",
          "type": "dateTime",
          "label": "Event start",
          "width": 1,
          "defaultValue": null,
          "placeholder": "yyyy-mm-dd HH:mm"
        },
        {
          "id": "q_terms",
          "type": "boolean",
          "label": "Accept terms",
          "width": 1,
          "required": true,
          "validations": [
            { "id": "v9", "rule": "required", "message": "You must accept the terms" }
          ],
          "defaultValue": { "kind": "static", "value": true }
        },
        {
          "id": "q_favorite",
          "type": "choice",
          "label": "Favorite color",
          "width": 0.5,
          "validations": [],
          "defaultValue": { "kind": "static", "value": "choc" },
          "options": [
            { "id": "o1", "label": "Blue", "value": "blue" },
            { "id": "o2", "label": "Chocolate", "value": "choc" },
            { "id": "o3", "label": "Green", "value": "green" }
          ]
        },
        {
          "id": "q_country",
          "type": "dropdown",
          "label": "Country",
          "width": 0.5,
          "validations": [{ "id": "v10", "rule": "required" }],
          "defaultValue": null,
          "options": [
            { "id": "c1", "label": "Germany", "value": "DE" },
            { "id": "c2", "label": "United States", "value": "US" },
            { "id": "c3", "label": "United Kingdom", "value": "UK" }
          ]
        },
        {
          "id": "q_tags",
          "type": "multiChoice",
          "label": "Interests",
          "width": 1,
          "validations": [{ "id": "v11", "rule": "required" }],
          "defaultValue": { "kind": "static", "value": ["a", "b"] },
          "options": [
            { "id": "t1", "label": "AI", "value": "a" },
            { "id": "t2", "label": "Web", "value": "b" },
            { "id": "t3", "label": "Mobile", "value": "c" }
          ]
        },
        {
          "id": "q_price",
          "type": "number",
          "label": "Price for {{q_name | title}}",
          "width": 0.5,
          "validations": [
            { "id": "v12", "rule": "number" },
            { "id": "v13", "rule": "min", "value": 10 },
            { "id": "v14", "rule": "between", "value": 10, "valueTo": 500 },
            {
              "id": "v15",
              "rule": "custom",
              "expression": "if(q_price > 500, msg('Too expensive, max 500'), true)"
            }
          ],
          "defaultValue": { "kind": "static", "value": 49.99 },
          "placeholder": "0.00",
          "min": 0,
          "max": 1000,
          "step": 0.01,
          "unit": "USD",
          "decimals": 2
        },
        {
          "id": "q_quantity",
          "type": "text",
          "label": "Quantity (text, numeric input)",
          "width": 0.5,
          "validations": [
            { "id": "v16", "rule": "integer" },
            { "id": "v17", "rule": "min", "value": 1 },
            { "id": "v18", "rule": "max", "value": 99 }
          ],
          "defaultValue": null,
          "placeholder": "1",
          "inputType": "number",
          "maxLength": 2
        },
        {
          "id": "q_bio",
          "type": "longText",
          "label": "Bio",
          "width": 1,
          "required": true,
          "validations": [
            { "id": "v19", "rule": "maxLength", "value": 1000, "message": "Max 1000 chars" }
          ],
          "defaultValue": null,
          "placeholder": "About you…",
          "rows": 6,
          "maxLength": 1000,
          "enabledWhen": {
            "logic": "any",
            "conditions": [
              {
                "fieldId": "q_quantity",
                "operator": "gte",
                "operand": { "kind": "literal", "value": 5 }
              }
            ],
            "groups": []
          }
        },
        {
          "id": "q_rating",
          "type": "scale",
          "label": "Overall rating",
          "width": 1,
          "validations": [],
          "defaultValue": { "kind": "expression", "expression": "round(avg(q_rating), 0)" },
          "min": 1,
          "max": 5,
          "step": 1,
          "minLabel": "Poor",
          "maxLabel": "Excellent"
        },
        {
          "id": "q_upload",
          "type": "file",
          "label": "Documents",
          "width": 1,
          "validations": [
            { "id": "v20", "rule": "minFiles", "value": 1 },
            { "id": "v21", "rule": "maxFiles", "value": 5 },
            { "id": "v22", "rule": "fileSizeMaxMb", "value": 10 },
            { "id": "v23", "rule": "fileType", "accept": "image/png,.pdf" }
          ],
          "defaultValue": null,
          "accept": "image/png,.pdf",
          "multiple": true,
          "enabledWhen": {
            "logic": "all",
            "conditions": [{ "fieldId": "q_tags", "operator": "hasAnyOf", "values": ["a", "b"] }],
            "groups": [
              {
                "logic": "any",
                "conditions": [
                  {
                    "fieldId": "q_quantity",
                    "operator": "gt",
                    "operand": { "kind": "literal", "value": 10 }
                  }
                ],
                "groups": []
              }
            ]
          }
        },
        {
          "id": "td_signed",
          "type": "textdisplay",
          "width": 1,
          "label": "Dear {{q_name | title}}, thank you for choosing {{q_favorite | upper}}.",
          "description": ""
        },
        {
          "id": "grp_addr",
          "type": "group",
          "label": "Address group",
          "width": 1,
          "defaultValue": null,
          "collapsible": true,
          "elements": [
            {
              "id": "q_street",
              "type": "text",
              "label": "Street",
              "width": 1,
              "defaultValue": null,
              "placeholder": "…",
              "inputType": "text"
            },
            {
              "id": "q_city",
              "type": "text",
              "label": "City",
              "width": 0.5,
              "defaultValue": null,
              "placeholder": "City in {{q_country | lower}}",
              "inputType": "text"
            }
          ]
        },
        {
          "id": "grp_sign",
          "type": "group",
          "label": "Attestation",
          "width": 1,
          "defaultValue": null,
          "collapsible": false,
          "elements": [
            {
              "id": "q_sign",
              "type": "signature",
              "label": "Signature",
              "width": 1,
              "required": true,
              "validations": [{ "id": "v24", "rule": "required", "message": "Please sign" }],
              "defaultValue": null
            }
          ]
        }
      ]
    },
    {
      "id": "p2",
      "title": "Done",
      "enabledWhen": {
        "logic": "all",
        "conditions": [{ "fieldId": "q_bio", "operator": "isNotEmpty" }],
        "groups": []
      },
      "elements": [
        {
          "id": "sec_end",
          "type": "section",
          "width": 1,
          "label": "",
          "description": "",
          "heading": "You are done"
        },
        {
          "id": "td_end",
          "type": "textdisplay",
          "width": 1,
          "label": "We'll contact you at {{q_email}}.",
          "description": ""
        }
      ]
    }
  ]
}
```

Rules of thumb: choose simple unique `id`s, reference only existing ids in pipes,
conditions, `defaultValue.fromField`/`expression`, and validation `expression`/`message`;
keep `schemaVersion: 1`; give every `choice`/`dropdown`/`multiChoice` ≥1 option.
