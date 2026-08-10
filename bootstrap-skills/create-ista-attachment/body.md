# Create an Ista attachment

Add a content fragment to an existing skill.

## 1. Ask

- Which existing skill is this for? (`ista skill list` if the user isn't sure of the exact name.)
- What should the attachment be called, and what's it for?

## 2. Scaffold and attach

Run `ista skill attach <skill> <attachment>`. If the attachment file doesn't exist yet this creates a placeholder and registers it in the skill's `skill.yaml`; if it already exists on disk, it just registers it.

## 3. Write the content

Fill in the attachment's markdown with the user. It gets appended to the parent skill's compiled body wherever that skill is synced.

## 4. Remind the user of the one rule that matters here

**Attachments inherit the parent skill's `capabilities` block in full and must not declare their own.** An attachment is a content fragment, not a separate skill -- it never has its own `skill.yaml`, and it never changes what the parent skill is allowed to do. If the attachment genuinely needs different capabilities than its parent, that's a sign it should be its own skill instead (`/create-ista-skill`), not an attachment.
