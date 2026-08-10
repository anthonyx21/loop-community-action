# LOOP — Build with AI Submission

**Anthony Nguyen · Arthur Chow**

## Pitch presentation

[▶ Watch the LOOP pitch presentation on Google Drive](https://drive.google.com/file/d/1oet-2Fmpab4eX1umLro4UdPExtEY2cb3/view?usp=drive_link)

A concise walkthrough of the community-coordination problem, the LOOP
solution, its human-in-the-loop safety model, and how verified impact turns
expiring capacity into measurable community action.

### Presentation companion

Use this alongside the pitch to see the claim each slide is designed to
substantiate. The central question is whether an ordinary, time-sensitive offer can
become a safe, human-approved, and measurable community response.

1. **Cover — coordination is the unmet need.** Communities often have useful
   capacity nearby: leftover meals, an available room, unused vehicle seats, or
   a volunteer with the right skills. The challenge is discovering the full
   operational context and coordinating a safe handoff before that capacity
   expires. LOOP is designed as the layer between “available” and “activated.”

2. **The friction — capacity is scattered and time-bound.** A provider may
   know that food or space is available, while a community organization knows
   who needs support; neither has a shared, current operational picture. Calls,
   spreadsheets, and ad-hoc messages consume the narrow window in which the
   resource is useful. This is why a directory alone is insufficient: a listing
   cannot confirm access, timing, ownership, or handoff.

3. **Why now — operational detail already lives in email.** The most useful
   information is usually unstructured: “40 meals until 8 PM,” “step-free
   entrance,” or “security host required.” Gemini converts that text into a
   structured record of resources, quantity, availability, location,
   accessibility, and conditions. The intent is not to automate a decision
   invisibly, but to make an ordinary offer legible and reviewable quickly.

4. **The LOOP — Forward → Extract → Match → Verify → Measure.** A forward or
   Gmail import begins the workflow. The backend extracts capacity, compares
   approved offers with a community need, creates a proposed response plan,
   requires human approval, and then writes a verified impact receipt. The
   important outcome is an actionable plan with traceable state—not a list of
   possible places to call.

5. **Why LOOP — activation, not discovery.** LOOP evaluates a response as a
   bundle of constraints. Food alone is not a useful response if it cannot be
   delivered in time, the space is inaccessible, or the owner has not approved
   the handoff. The provider stays in the workflow they already use—email—while
   a coordinator retains responsibility for the details that require judgment.

6. **Before / after — fragmented inboxes become approved action.** Before
   LOOP, information is distributed across people and systems, and manual
   follow-up competes with the expiry clock. After LOOP, one message becomes
   structured capacity, a feasible proposal, explicit approval, and an auditable
   outcome. This is the change the product is designed to make tangible.

7. **Live demo — Gmail intake to impact receipt.** The demo walks through the
   complete flow: Maria forwards an email describing unused meals and an
   accessible atrium; Gemini extracts the meals and space; a coordinator
   approves the capacity; LOOP creates a plan for a time-sensitive community
   need; and the coordinator activates it. The final receipt shows illustrative
   measures—meals redirected, warm space activated, people supported, and waste
   avoided—to demonstrate how completed action can be measured.

8. **Trust + impact — authorization and measurement are required.** AI can
   extract, organize, and recommend, but it does not authorize access, safety,
   ownership, or handoff. Those transitions are role-gated in the backend and
   recorded as workflow and audit events. The impact receipt is intentionally
   tied to an activated plan, so the system distinguishes a proposed offer from
   a verified community outcome.

9. **Closing — nearby capacity can arrive in time.** The opportunity is simple:
   make overlooked local capacity dependable enough to become community action
   before it expires.

## Product demo

[▶ Watch the LOOP product demo on Google Drive](https://drive.google.com/file/d/1lRHDchGgwdBOBZbHe_x3gdqvj_ahQqil/view?usp=drive_link)

LOOP turns expiring, overlooked community capacity into verified action. A
partner can forward an existing email about unused meals, available space,
transport, or volunteers; LOOP extracts the operational details, helps a
coordinator build and approve a response plan, then records a verified impact
receipt after activation.

Members enter the workflow through Firebase Authentication with Google Sign-In.
Their authenticated identity determines which organization data they can view
and which role-gated actions they can perform.

## What the prototype demonstrates

1. Gmail-forward or Gmail API intake for capacity already described in email.
2. Gemini-powered extraction of resources, quantities, availability, location,
   accessibility, and conditions.
3. Human review and role-gated approval before a response can be activated.
4. Constraint-aware response planning, route context, and a live impact receipt.

## Technology

- **Gemini** provides structured extraction and response-plan reasoning.
- **Firebase Authentication and Firestore** provide identity and live workflow state.
- **Cloud Run** keeps Gemini and Firebase Admin credentials server-side and
  enforces roles, approvals, and audit events.
- **Google Maps Platform** provides route context for the proposed response.

The functional source is in [`app/`](app/README.md). It includes the
React client, Cloud Run API, Firebase rules, environment templates, and deploy
configuration. A configured Google Cloud/Firebase project is required to run
the connected workflow; no API keys are included.

Released under the [MIT License](LICENSE).
