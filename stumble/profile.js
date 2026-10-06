// What Stumble knows about the viewer's taste. Pure: no chrome.* here.
//
// The profile is rebuilt from scratch by Learn (watch history plus
// subscriptions). Ratings live separately in `factors`, so pressing Learn
// again never wipes what likes and skips taught it.

const STOPWORDS = new Set(
  (
    "the and for are but not you all any can had her was one our out has him his how its may new now old see two way who " +
    "did get let put say she too use that with have this will your from they know want been good much some time very when " +
    "come here just like long make many over such take than them well were what into more only also back after first even " +
    "most then these those their there which while would could should about again because before being between both down " +
    "during each every few further i'm it's don't can't won't i've you're he's she's that's what's there's let's we're they're " +
    "doesn't didn't isn't wasn't aren't haven't how's why who's where when's ever never always still yet off own same so " +
    "video videos part episode ep full official new best top ever watch live shorts short vs " +
    "why who how what when where this that these my me i we us our you your he she it they them his her its their " +
    "one two three four five six seven eight nine ten 100 1000"
  ).split(/\s+/),
);

const MIN_TITLES = 5;
const MIN_CHANNELS = 3;
const MAX_TOPICS = 5000;
const RECENT_SEEDS = 300;
const SUBSCRIBED_BONUS = 1;
const MIN_FACTOR = 0.05;
const MAX_FACTOR = 20;

export const RATING_FACTOR = { like: 1.5, skip: 1 / 1.5, softLike: 1.15, softSkip: 1 / 1.15 };

export function titleTerms(title) {
  const words = title.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/);
  const keep = (w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w);
  const terms = new Set();
  for (let i = 0; i < words.length; i++) {
    if (!keep(words[i])) continue;
    terms.add(words[i]);
    if (i + 1 < words.length && keep(words[i + 1])) terms.add(`${words[i]} ${words[i + 1]}`);
  }
  return [...terms];
}

// history: videos from the watch history, newest first.
// subscriptions: [{channelId, channelName}].
export function buildProfile(history, subscriptions) {
  const channels = {};
  const termTitles = new Map();
  const termChannels = new Map();

  for (const v of history) {
    if (v.channelId) {
      const c = (channels[v.channelId] ??= { name: v.channelName, watches: 0, subscribed: false });
      c.watches++;
    }
    for (const t of titleTerms(v.title)) {
      termTitles.set(t, (termTitles.get(t) ?? 0) + 1);
      if (!termChannels.has(t)) termChannels.set(t, new Set());
      termChannels.get(t).add(v.channelId);
    }
  }
  for (const s of subscriptions) {
    const c = (channels[s.channelId] ??= { name: s.channelName, watches: 0, subscribed: false });
    c.subscribed = true;
  }

  // A word only counts as a topic when it shows up across several titles
  // from more than one channel; otherwise it is just one channel's name.
  const topics = Object.fromEntries(
    [...termTitles]
      .filter(([t, n]) => n >= MIN_TITLES && termChannels.get(t).size >= MIN_CHANNELS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOPICS),
  );

  return {
    learnedAt: Date.now(),
    historyCount: history.length,
    subscriptionCount: subscriptions.length,
    channels,
    topics,
    recent: history.slice(0, RECENT_SEEDS).map((v) => ({ videoId: v.videoId, title: v.title })),
  };
}

function median(values) {
  if (values.length === 0) return 1;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// The weighted lists Stumble picks from. Channels and topics the viewer
// liked while stumbling join the lists even if Learn never saw them, at the
// median weight, so a liked discovery can become familiar.
export function interests(profile, factors) {
  const channelBase = Object.values(profile.channels).map((c) => c.watches + (c.subscribed ? SUBSCRIBED_BONUS : 0));
  const topicBase = Object.values(profile.topics);
  const channelMedian = median(channelBase);
  const topicMedian = median(topicBase);

  const channels = Object.entries(profile.channels).map(([id, c]) => ({
    id,
    name: c.name,
    weight: (c.watches + (c.subscribed ? SUBSCRIBED_BONUS : 0)) * (factors.channels[id]?.factor ?? 1),
  }));
  for (const [id, f] of Object.entries(factors.channels)) {
    if (!profile.channels[id]) channels.push({ id, name: f.name, weight: channelMedian * f.factor });
  }

  const topics = Object.entries(profile.topics).map(([term, n]) => ({
    term,
    weight: n * (factors.topics[term] ?? 1),
  }));
  for (const [term, f] of Object.entries(factors.topics)) {
    if (profile.topics[term] === undefined) topics.push({ term, weight: topicMedian * f });
  }

  return { channels, topics };
}

export const effectiveRating = (entry) => entry.rating ?? entry.soft ?? null;

const factorOf = (rating) => (rating ? RATING_FACTOR[rating] : 1);
const clamp = (f) => Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, f));

// Moves the entry's channel and title topics from its old rating to its new
// one. Re-rating divides out the old rating first, so changing a like to a
// skip from the history page does not leave the like's boost behind.
export function applyRating(factors, profile, entry, oldRating, newRating) {
  const ratio = factorOf(newRating) / factorOf(oldRating);
  if (ratio === 1) return;
  // Web pages: a site rated down far enough stops coming up at all.
  if (entry.site) {
    factors.sites ??= {};
    factors.sites[entry.site] = clamp((factors.sites[entry.site] ?? 1) * ratio);
  }
  if (entry.channelId) {
    const c = (factors.channels[entry.channelId] ??= { name: entry.channelName, factor: 1 });
    c.factor = clamp(c.factor * ratio);
  }
  for (const term of titleTerms(entry.title)) {
    // Known topics move either way. A like may add a new two-word topic
    // ("log cabin"); single new words are too vague ("build") and a skip
    // on an unknown term teaches nothing.
    const known = profile.topics[term] !== undefined || factors.topics[term] !== undefined;
    if (!known && (ratio < 1 || !term.includes(" "))) continue;
    factors.topics[term] = clamp((factors.topics[term] ?? 1) * ratio);
  }
}

export function emptyFactors() {
  return { channels: {}, topics: {}, sites: {} };
}
