/* Per-game overrides for deriving a usable room title, for games whose
   status bar doesn't show a room name at all. Most games never touch this
   file — core.js only calls in here for the handful of games actually
   listed in TITLE_FALLBACKS below. */

function isPlausibleRoomTitle(title) {
  return !!title && title.length <= 40;
}

/* A Mind Forever Voyaging's status bar shows a persistent "Mode: X"
   indicator (Communications Mode, Simulation Mode, ...) instead of a room
   name at all. core.js's roomName() strips everything after the first big
   gap in the status bar text, which reduces every single location down to
   the same bare "Mode:", collapsing every room into one fake, unchanging
   key and permanently freezing image generation on whatever room happened
   to load first.

   Only Simulation Mode has real spatial locations worth an image. Entering
   a new area there prints a "Location: X Date: Y" header as the first
   description line — X is the location name and Y is the in-game era
   (e.g. "Kennedy Park" / "6/9/2041" out of "Location: Kennedy Park Date:
   6/9/2041"). Both matter: the game revisits the same ~158 physical
   locations across up to 6 different simulated decades with meaningfully
   different scenery each time (a park in a thriving 2051 Rockvil looks
   nothing like the same park in the 2091 collapse), so keying on the
   location name alone would wrongly reuse one era's cached image for
   every other era of the same place.

   Ordinary within-area movement — including a failed move ("There's no
   exit on that side of the park.") — doesn't reprint that header at all,
   since you haven't actually gone anywhere; falling back to the generic
   "Mode:" placeholder on those turns would needlessly swap away the
   correct image for a location/era you never left. state.lastTitle
   remembers the last confirmed location+date and keeps reusing it until a
   fresh "Location:" line proves you've actually moved somewhere (or
   somewhen) new.

   Requiring the explicit "Location: ... Date: ..." header (rather than
   just grabbing any short first line of the description) matters too —
   plenty of ordinary game text is short enough to look like a title
   otherwise: a stray line of dialogue ("You sound rather positive.") or a
   parser error ("[I beg your pardon?]") would otherwise get mistaken for
   a room. */
function mindforevervoyaging(rawTitle, cleanedTitle, description, state) {
  if (!/\bSimulation Mode\b/i.test(rawTitle)) {
    state.lastTitle = null;
    return cleanedTitle;
  }
  if (cleanedTitle !== "Mode:") return cleanedTitle;

  const m = /^Location:\s*(.+?)\s+Date:\s*(\S+)/i.exec(description.split("\n")[0].trim());
  if (m && m[1] !== "(undefined)") {
    const combined = `${m[1]} (${m[2]})`;
    if (isPlausibleRoomTitle(combined)) {
      state.lastTitle = combined;
      return combined;
    }
  }
  return state.lastTitle || cleanedTitle;
}

/* Keyed by the resolved game name (aliases.json's values, e.g.
   "mindforevervoyaging") — see games.json/aliases.json for how a raw
   gameId resolves to one of these names. */
export const TITLE_FALLBACKS = { mindforevervoyaging };
