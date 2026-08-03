# Send a deck. They can edit it.
> SIMULAR · ENGINEERING
One HTML file that carries its own editor. No install, no account, no server — and the person you send it to can fix a typo without coming back to you.

## An agent writes a deck in a minute. Then it is frozen.
> THE PROBLEM
- The HTML is fine. It looks right and it presents
- But nobody can move a box, fix a number or change a word
- Every deck is built differently, so no one tool fits the next one
- The moment it needs a small change, it needs the whole pipeline again

## So people do one of two things, and both are bad
> TODAY
- Regenerate the whole deck to change one line, and lose the edits they liked
- Or rebuild it in Slides, where the design does not survive the paste
- Either way the deck stops being the thing they were working on
- And a reviewer with a correction has nowhere to put it

## Publish the structure. Edit anything that meets it.
> THE BET
- Do not own the design. Own the shape a deck has to have
- Anything conforming to it becomes editable, whoever wrote it
- The editor travels inside the file, so there is nothing to open it with
- An agent can write to that shape as easily as to any other

## Two rules, and a naming convention
> THE CONTRACT
- A slide is a section.slide directly under .slides-offset
- An editable thing is a .slide-object with a data-oid and a type
- Geometry is percentages, so a slide scales instead of breaking
- Everything else in the runtime is built on top of those

## It has no opinion about how a deck looks
> ANY DESIGN
- It reads a handful of CSS variables and falls back on every one
- Your token file works as it is — --bg, --accent, --t1, no renaming
- A deck with zero custom properties passes the whole suite
- Verified, not claimed: three unrelated decks, the same checks

## Open the file. You are in the editor.
> THE EDITOR
- Pages down the left, the slide in the middle, properties on the right
- Drag, resize, snap to what is already there
- Undo and redo everything, including the things a panel did

## Every object says what it can be
> PROPERTIES
- Size, angle, opacity, order, shadow, and aligning to each other
- Shapes take a fill, a stroke, a line style and corners
- Tables take a header row, grid lines, padding and a preset
- Charts take several series, a legend, labels and a grid

## And the words have their own bar
> TEXT
- It appears over what you selected, because that is what it acts on
- Font, size, weight and colour on those words, not the whole box
- Bullets and numbering, with Tab to nest
- Links on the words themselves, or on a whole object

## Numbers move when you arrive
> MOTION
- Objects fade or slide in, in the order you set
- A number counts up from zero instead of just sitting there
- Two objects sharing an id on neighbouring slides morph between them
- All of it stands down when the reader has asked for less motion

## F5 presents. S is for you.
> PRESENTING
- Full screen, arrow keys, and a bar that stays out of the way
- The speaker view carries your notes and a timer on the second screen
- Escape puts you back exactly where you were editing
- Any slide can be skipped without being deleted

## Save writes the file itself
> SAVING
- Changes are kept as you make them, so a crash costs nothing
- Save writes them into the .html in place
- It asks once, because a page opened from a disk is given no write access
- After that it is silent

## Then send it, however they need it
> SENDING
- The file itself: they open it and they can edit it
- A reading copy: opens as a deck to read, with a way in if they want it
- A PDF, for the people who will only ever want a PDF
- Framed in another page it stands down and lets the host drive

## Three commands
> USING IT
- make_deck.py --content outline.md --design tokens.css
- port_to_editable.py --source their-deck.html
- refresh_runtime.py --file deck.html

## Where it is
> NEXT
- github.com/dora-dotcom/editable-slides-runtime
- MIT. Drop it into a deck, or build one from a markdown outline
- One file. One contract. Whatever design you brought
