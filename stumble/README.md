# Stumble

One button that opens a random YouTube video or website you might like,
like StumbleUpon used to. It learns what you like from your own YouTube
watch history and subscriptions, then gets better as you rate what it
shows you.

Works in Chrome, Brave and Edge.

## Install

1. Go to <https://github.com/abix-/chromium-extensions>, click the green
   **Code** button, then **Download ZIP**.
2. Unzip it. Inside is a `stumble` folder. Move that folder somewhere it
   can stay for good, for example `Documents\Stumble`. Chrome runs the
   extension straight from this folder, so do not delete or move it later.
3. Open `chrome://extensions` in the address bar.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and pick the `stumble` folder (the one with
   `manifest.json` in it).
6. Click the puzzle piece in the toolbar and pin **Stumble** so its
   button (the blue die) is always there.

Chrome may warn that Stumble can "read and change all your data on all
websites". It needs that to fetch YouTube and the website lists, and to
show its rating bar on the page it opened. It only adds the bar to the
tab Stumble itself opened.

## First run

1. Make sure you are signed in to YouTube in this browser.
2. Press the Stumble button. The first time, it opens the options page.
3. Press **Learn**. It reads your whole YouTube watch history and your
   subscriptions, then your Prime Video watch history. A long history
   takes a few minutes; leave the page open until it says Done. You will
   see YouTube and Amazon tabs open and close by themselves while it reads.

If you do not use Prime Video, or use an Amazon outside amazon.com, it
will say "Done, but Prime Video failed". That is fine; YouTube is what
matters.

If your YouTube watch history is turned off or empty, YouTube stumbles
will not work. Websites still will.

## Using it

Press the button. Stumble opens a video or a website in its own tab, and
every press after that reuses the same tab. While it is searching the
button shows `...`.

A bar at the bottom left of the page says why it picked this, with
three buttons:

- **Like**: more like this. The bar then gets out of the way.
- **Not for me**: less like this, and go to the next one.
- **Next**: just go to the next one.

You do not have to rate everything. How long you watch counts too:
most of a video (or 10 minutes) counts as a small like, leaving within
15 seconds counts as a small skip. For websites it is 2 minutes and 10
seconds.

Right-click the button for:

- **Stumble history**: everything you stumbled onto. You can change any
  rating there.
- **Learn and options**: the options page.

## Options

- **Mix**: tick YouTube, Websites or both. The sliders set how often
  each comes up. The boxes next to them pick what kind: videos, Shorts
  and live streams for YouTube; websites and blogs, webcomics and GitHub
  projects for Websites.
- **What I like / Surprise me**: left gives you more of what you already
  watch, right gives you more things you have never seen.
- **What it learned**: your top channels and topics. Press **Learn**
  again whenever your taste moves on. Your likes and skips are kept.

Websites come from Kagi Small Web, StumbleUponAwesome and Marginalia's
random small sites.

## Privacy

Everything Stumble learns stays in this browser. Your history is never
uploaded anywhere. To find things it searches YouTube and downloads
public website lists from Kagi, GitHub and Marginalia.

## Updating

1. Download the ZIP again.
2. Copy the new `stumble` files **over the same folder** you installed
   from, replacing the old ones.
3. On `chrome://extensions`, click the reload arrow on Stumble's card.

Use the same folder every time. If you load it from a different folder,
Chrome treats it as a new extension and you lose what it learned, your
history and your likes.

## If something goes wrong

If the button shows `!`, hover over it to see why. "Nothing fresh after
6 tries" usually means YouTube was busy or your history is empty; press
again, or press Learn again.
