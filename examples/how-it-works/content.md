# A deck that edits itself
> SIMULAR · ENGINEERING
One HTML file. Open it and you are in the editor. Send it and the person who gets it has the whole thing.

## What is actually in the file
> THE FILE
- The slides, as ordinary HTML you or an agent wrote
- The editor, the presenter and the speaker view, inlined
- Every picture, clip and font you added, carried inside
- Nothing else. No server, no account, no install

## It has no opinion about how a deck looks
> BRING YOUR OWN DESIGN
- It reads a handful of CSS variables and falls back on every one
- A deck with zero custom properties passes the whole test suite
- Your company's design system, a design.md, a theme off GitHub — all fine
- The look is yours; this only makes it editable

## What a deck has to provide
> THE CONTRACT
- A slide is a section.slide directly under .slides-offset
- An editable thing is a .slide-object with a data-oid and a type
- Geometry is percentages, so a slide scales instead of breaking
- That is the whole contract. Two rules and a naming convention

## Everything you can put on one
> THE OBJECTS
- Text, shapes, pictures, video and audio
- Tables with a header row, grid lines and padding you can set
- Charts that take more than one series, with labels and a legend
- Fields that stay right: the page number, the total, today's date

## The numbers move when you arrive
> MOTION
- An object can fade or slide in when its slide comes up
- A number counts up from zero instead of just sitting there
- Two objects sharing an id on neighbouring slides morph between them
- All of it stands down when the reader asks for less motion

## Two states, and nothing to get lost in
> STATES
- Editing is where you land, because the file is an editor
- F5 presents; Escape puts you back exactly where you were
- S opens a speaker view with your notes and a timer
- A copy can be marked as something to read instead

## Save writes the file
> SAVE
- Changes are kept as you make them, so nothing is lost to a crash
- Save writes them into the .html itself, in place
- The first save asks once, because a page opened from a disk is given no write access
- After that it is silent

## Inside someone else's viewer it gets out of the way
> ETIQUETTE
- Framed in another page, it hides its own chrome and releases the keys
- The host owns paging; the deck is just content
- One attribute hands the whole runtime back when the host wants it

## Where it is
> NEXT
- github.com/dora-dotcom/editable-slides-runtime
- Drop the runtime into a deck, or build one from a markdown outline
- 4,700 lines. 73 KB compressed, once per file
