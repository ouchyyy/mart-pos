// ============================================================
// cartChannel.js — sending the cart to the customer's screen
//
// The till and the customer display are two separate browser
// windows. BroadcastChannel lets one send messages to the other,
// as long as both are on the same website. Nothing goes near the
// database — the customer screen only ever shows what the till
// tells it, so there is no waiting and nothing to keep in step.
// ============================================================

const CHANNEL_NAME = 'mart-pos-cart';

// A window that has not opened the channel yet gets nothing, so
// we also keep the last message. A customer screen opened halfway
// through a sale then shows the cart instead of an empty box.
const STORAGE_KEY = 'mart-pos-last-cart';

let channel = null;

function getChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

// Called by the till whenever the cart changes.
export function sendToCustomerScreen(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Private browsing can refuse this. Not worth stopping for.
  }

  const c = getChannel();

  if (c) {
    c.postMessage(state);
  }
}

// Called by the customer screen. Returns a function that stops
// listening, which React calls when the page closes.
export function listenForCart(onChange) {
  const c = getChannel();

  if (c) {
    c.onmessage = (event) => onChange(event.data);
  }

  return () => {
    if (c) {
      c.onmessage = null;
    }
  };
}

// Whatever was last sent, for a screen that has just opened.
export function lastKnownCart() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (err) {
    return null;
  }
}
