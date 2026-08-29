---
name: break
description: Answers "does this survive?" for one component. Renders it on a throwaway page under the hostile inputs it can actually receive, and reports what visibly broke.
disable-model-invocation: true
---

# Break

This skill takes one component, renders it on a fresh page under every scenario that can actually reach it and reports what broke. A component built against one happy path looks finished right up until real content arrives.

It observes rather than judges. A finding here is something that visibly broke on the page, named in the vocabulary of the domain skill that owns the fix. Reviewing code against a standard is `interface-review` and `better-interface`; exploring design alternatives is `variant`.

Where `variant` insists on the real page, this skill isolates on purpose. You are not judging how the component looks in context. You are checking whether it defends itself when the content is worst-case.

## 1. Scope one component

One component per run. "The settings page" is not a component; the profile form's text input is. Where the request spans several, list the candidates and ask which one to test, rather than picking on the user's behalf.

Restate what the component is in one sentence: what it accepts, what it renders and where it will live.

## 2. Infer the scenarios from the component

Stress only what varies. A scenario earns a slot when the component accepts something that can take that shape in production. So read the component first: its props, its slots, its states and the data it renders.

[scenarios.md](scenarios.md) holds the axes, the values on each and the cue that says whether an axis applies. Walk it against the component and keep only the axes whose cue matches. A text input gets content length and states, never item quantity. A static icon button with a fixed label gets container and environment, never long text.

Write the kept scenarios down before building, one line each, so the harness renders a planned set rather than whatever came to mind. Then say which axes you dropped and why, in one line, so a wrong inference is cheap to catch.

## 3. Build the harness page

One throwaway page, holding the real component imported from the project, rendered once per scenario in a single column. Label every instance with its scenario name, and give the harness a dashed outline around each instance so overflow past the component's own box is visible.

Use the project's own stack: a scratch route in its dev server where one exists, a single self-contained HTML file where none does. Feed scenarios as props and fixture data. The harness never imports production state, never wires to live data and production never imports from the harness.

Keep the harness visibly outside the design system, plain and unstyled, so nothing it adds is mistaken for the component's own rendering.

## 4. Render and observe

A run that never rendered is a code review wearing a costume. Load the page, look at every scenario and record only what you saw. Reading the CSS and predicting "this would probably overflow" is not a finding.

With a scriptable browser, screenshot the page, resize to 320px and screenshot again, and tab through the interactive scenarios. Without one, start the dev server or write the file, then ask the user to open it and continue from what they report.

For each scenario record one of two outcomes: survived, or broke with what was visible. "Text escapes the card's right edge", never "spacing feels tight".

## 5. Report what broke and stop

Report findings as a table, broken scenarios first:

| Scenario | Observed | Owner |
| --- | --- | --- |
| One unbreakable 60-character string | Overflows the card, no wrap and no truncation | `better-typography` |
| Zero items | Blank region with no message | `better-writing` |

The owner column names the domain skill whose rules diagnose the break, so the fix starts in the right place. This skill owns no domain rules and issues no verdict.

"Everything survived" is a complete and useful report. Say which scenarios ran and at which widths, and end there rather than padding the result with preferences.

Do not fix anything unasked. On a request to fix, follow the owner skill's rules, then re-render the failing scenarios to confirm.

## 6. Delete the harness

The harness is the instrument, not the deliverable. Once the report is delivered, delete the page and its fixtures unless asked to keep them.

## Before you finish

| Mistake | Fix |
| --- | --- |
| Every axis run against every component | Keep only the axes whose cue matches, and say which you dropped |
| A predicted failure reported as observed | Render it, or leave it out |
| A rebuilt lookalike component in the harness | Import the real component from the project |
| Findings phrased as taste | Report what was visible on the page, or nothing |
| A break reported without an owner | Name the domain skill whose rules diagnose it |
| A clean run padded with suggestions | "Everything survived" plus the scenario list is the report |
| Judged at one width | 320px and a wide viewport at minimum |
| Harness left behind | Delete it unless asked to keep it |
