// upit content script. Runs on www.reddit.com. Plain JS, no WASM:
// it only reads <shreddit-post> elements for the side panel and clicks
// Reddit's own vote button on the post the panel names.

function readPost(el) {
  const body = el.querySelector('[slot="text-body"]');
  return {
    permalink: el.getAttribute("permalink") || "",
    title: el.getAttribute("post-title") || "",
    body: body ? body.textContent.trim() : "",
    subreddit: el.getAttribute("subreddit-prefixed-name") || "",
    score: Number(el.getAttribute("score")) || 0,
    voteType: el.getAttribute("vote-type") || "",
  };
}

function findPost(permalink) {
  for (const el of document.querySelectorAll("shreddit-post")) {
    if (el.getAttribute("permalink") === permalink) return el;
  }
  return null;
}

function vote(permalink, button) {
  const el = findPost(permalink);
  if (!el) return { ok: false, error: "post is no longer on the page" };
  if (el.getAttribute("vote-type") === button) return { ok: true };
  const btn = el.shadowRoot && el.shadowRoot.querySelector(`button[${button}]`);
  if (!btn) return { ok: false, error: `no ${button} button found on the post` };
  btn.click();
  return { ok: true };
}

function allPosts() {
  return [...document.querySelectorAll("shreddit-post")].map(readPost);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "upit:collect") {
    sendResponse({ posts: allPosts() });
  } else if (msg.type === "upit:vote") {
    sendResponse(vote(msg.permalink, msg.button));
  }
});

// Push posts to the side panel as Reddit loads them while you scroll.
// Rejects when the panel is closed; nothing to do then.
let pushTimer = 0;
let pushedCount = -1;
function pushPosts() {
  pushTimer = 0;
  const count = document.querySelectorAll("shreddit-post").length;
  if (count === pushedCount) return;
  pushedCount = count;
  chrome.runtime.sendMessage({ type: "upit:posts", posts: allPosts() }).catch(() => {});
}
new MutationObserver(() => {
  if (!pushTimer) pushTimer = setTimeout(pushPosts, 300);
}).observe(document.body, { childList: true, subtree: true });
pushPosts();
