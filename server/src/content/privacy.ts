/**
 * The privacy notice, and the record of which version each person accepted.
 *
 * Kept in code rather than in a database row so that changing it is a reviewed
 * commit with a date attached, and so the version a person agreed to can always
 * be reconstructed from history.
 *
 * Bumping VERSION withdraws existing consent: everyone is asked again on their
 * next visit. Only bump it for changes that alter what is collected, why, who
 * receives it, or how long it is kept — not for typos.
 */
export const PRIVACY_VERSION = '2026-08-27';
export const PRIVACY_EFFECTIVE = '27 August 2026';

export const PRIVACY_POLICY = `# Privacy Notice

**Version ${PRIVACY_VERSION} · Effective ${PRIVACY_EFFECTIVE}**

This notice explains what Pantry to Plate ("the app") collects about you, why,
where it goes, and what you can make it do. It is written to be read, not to be
survived. If something here is unclear, treat that as a fault in the notice and
ask.

---

## 1. Who is responsible

The app is operated privately by the individual who runs this installation
("the operator"). It is not a company, and there is no support department. The
operator is the data controller for everything described below and is the person
to contact about any of it.

Because this is a self-hosted, personal deployment, the operator can read the
database. That is a plain consequence of self-hosting rather than a hidden
practice, and it is stated here so nobody is surprised by it.

---

## 2. What is collected

### 2.1 Things you type in

- **Account**: your email address and a password. The password is never stored.
  What is stored is a bcrypt hash, which cannot be reversed into your password.
- **Food and pantry**: the foods you add, quantities, units, storage locations,
  expiry dates, and low-stock thresholds.
- **What you eat**: every consumption entry, with amounts, meal slot, timestamp,
  and the calories and macronutrients calculated for it.
- **Waste**: what you threw away, when, and the reason you gave.
- **Recipes**: recipes you write, recipes you import from a link, ratings, meal
  plans, and per-cook decisions such as leaving an ingredient out.
- **Shopping list**: items, quantities, and whether they are ticked.
- **Settings**: your calorie and macronutrient targets, dietary tags, unit
  system, and notification preferences.

### 2.2 Health-related information

If you choose to use the calorie calculator, the app stores your **height,
weight, year of birth, sex, activity level, and weight goal**.

This is health-related information, and it deserves naming separately for three
reasons:

1. **It is entirely optional.** Every feature except the personalised calorie
   estimate works without it. You can use the app indefinitely and never enter
   any of it.
2. **It is used for one purpose only** — calculating a suggested daily calorie
   target and macronutrient split. It is not used for anything else, ever.
3. **You can delete it at any time** without deleting your account, and the app
   will fall back to a plain default target.

Your diary is also health-related information by nature: what a person eats over
months says a great deal about them. It is treated with the same care.

### 2.3 Things collected automatically

- **Server logs.** Each request is logged with its method, path, response status
  and duration. Logs may include your IP address. They exist to diagnose faults
  and are not used to build a profile of you.
- **Session tokens.** Signing in issues a token that your browser stores and
  sends with each request. It expires after 30 days.
- **Local browser storage.** Your session token and your light/dark preference
  are stored in your browser. No advertising, analytics or tracking cookies are
  set. The app does not use Google Analytics or any equivalent.

### 2.4 What is never collected

- Payment or card details. The app takes no payments.
- Precise location. The app never requests it.
- Contacts, calendar, microphone, or files.
- **Camera images.** The barcode scanner runs entirely inside your browser. The
  video never leaves your device, is never uploaded, and is never recorded. Only
  the decoded barcode number is sent to the server.

---

## 3. Why it is used

| Purpose | What it uses | Lawful basis (UK/EU GDPR) |
|---|---|---|
| Running your account | Email, password hash | Contract |
| Tracking your pantry and suggesting recipes | Food, inventory, recipe data | Contract |
| Calculating a calorie target and macros | Height, weight, age, sex, activity | **Explicit consent** |
| Showing your diary and reports | Consumption and waste logs | Contract |
| Looking up barcodes and nutrition | Barcode numbers, search terms | Legitimate interests |
| Keeping the service working and secure | Server logs | Legitimate interests |

Consent for the calorie calculator is separate from your agreement to this
notice, is asked for at the point of use, and can be withdrawn by deleting those
fields. Withdrawing it does not affect the rest of the app.

Your data is **never** used for advertising, sold, rented, shared with data
brokers, or used to train machine-learning models.

---

## 4. Who else sees it

### 4.1 Nobody, mostly

The app has no analytics provider, no advertising network, no customer-support
tool, and no third-party SDK. Other users of the same installation cannot see
your pantry, your diary, or the recipes you import — that separation is enforced
in the code and covered by automated tests.

### 4.2 Two outside services, for food data only

When you scan a barcode or search for a food, a request goes to:

- **Open Food Facts** (open-food-facts.org), a non-profit food database. It
  receives the barcode number and an identifying user-agent string. Their
  privacy policy governs what they do with it.
- **USDA FoodData Central** (fdc.nal.usda.gov), a United States government
  database. It receives your search term and an API key.

**Neither receives your identity, your email, your pantry, or your diary.** They
see an anonymous request for a barcode or a food name and nothing tying it to
you. Results are cached locally so the same lookup is not repeated.

If you import a recipe from a link, the server fetches that page. The site you
linked to will see the server's IP address, not yours.

### 4.3 Hosting

Wherever this installation runs — a personal machine, a cloud server, or a
managed platform — that provider necessarily stores the data on their hardware
and may have technical access to it. Ask the operator where this instance runs
if it matters to you.

### 4.4 Legal requests

If validly compelled by law, the operator may have to disclose data. They will
tell you unless legally prohibited from doing so.

---

## 5. Sponsored content

The app may display clearly labelled sponsored placements. These are **static
and local**: they are chosen from a list stored in this app's own database based
on what is on your shopping list. No advertising network is contacted, no
tracking pixel loads, no third party learns anything about you, and no data
leaves the app. They can be switched off entirely in Settings.

---

## 6. How long it is kept

- **While your account exists**, your data is kept so the app can work. A pantry
  that forgets is not a pantry.
- **Server logs** are kept only as long as the hosting platform retains them,
  typically days to weeks.
- **Cached food data** from external lookups is kept indefinitely, because it
  describes a product rather than a person.
- **When you delete your account**, everything belonging to you is removed
  immediately and permanently: pantry, diary, waste log, shopping list, recipes
  you added, ratings and meal plans, and all body data. This is a real deletion
  from the database, not a flag. It cannot be undone and there is no grace
  period.

Backups, if the operator keeps any, may retain a copy until they age out on
their normal cycle.

---

## 7. Your rights

Under UK and EU data protection law you have the right to:

- **Access** a copy of your data. Settings has an export that produces a
  complete machine-readable file, immediately, without asking anyone.
- **Rectify** anything wrong. Every value in the app is editable.
- **Erase** your data — see account deletion above.
- **Restrict or object** to processing.
- **Portability** — the export is JSON, a standard format.
- **Withdraw consent** for the calorie calculator at any time.
- **Complain** to a supervisory authority. In the UK that is the Information
  Commissioner's Office (ico.org.uk).

You do not need to ask permission to exercise the first four; the app implements
them as buttons.

---

## 8. Security

- Passwords are hashed with bcrypt (cost factor 10). Nobody, including the
  operator, can read your password.
- Sessions use signed tokens with a 30-day expiry.
- The app should be served over HTTPS. The barcode scanner will not function
  otherwise, because browsers refuse camera access on insecure connections.
- Each account's data is isolated by queries scoped to the signed-in user, and
  that isolation is covered by automated tests.

No system is perfectly secure. This one is a personal project, not a bank, and
it has not had a professional security audit. Use a password you do not use
anywhere else.

---

## 9. Children

The app is not intended for anyone under 16, and accounts should not be created
for them. It is not designed for supervised or clinical use, and calorie
tracking can be harmful for people with a history of disordered eating. If that
applies to you, please speak to a professional before using the calorie
features — or use the pantry and recipe features alone, which work perfectly
well without them.

---

## 10. This is not medical advice

Calorie targets and macronutrient suggestions are estimates from a standard
formula (Mifflin-St Jeor with an activity multiplier). They are not a
measurement of your metabolism, not personalised medical advice, and not a
substitute for a doctor or a registered dietitian. Actual energy needs vary
substantially between people with identical measurements.

Nutrition figures come from public databases and from what you enter. They may
be wrong. **Do not rely on this app for anything medical**, including managing
diabetes, allergies, or any other condition. Always check the packaging for
allergens.

---

## 11. International transfers

External food lookups go to services that may be hosted outside the UK and EEA,
including the United States. Only an anonymous barcode number or search term is
sent. No personal data is transferred internationally by the app itself.

---

## 12. Changes

If this notice changes in a way that affects what is collected, why, who
receives it, or how long it is kept, the version number changes and you will be
asked to review and accept the new version before continuing to use the app.
Cosmetic corrections will not interrupt you.

The version you accepted, and when, is recorded against your account.

---

## 13. Contact

Contact the operator of this installation. For a private deployment that is
whoever gave you the link.

---

**By creating an account you confirm you have read this notice and agree to your
data being handled as described.**
`;
