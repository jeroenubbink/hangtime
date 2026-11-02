// Online play without a game server: browsers find each other through public Nostr relays (with Trystero) and
// then talk directly over WebRTC. The relays only carry the handshake, encrypted with the room code; nothing
// else passes through them. Loaded on demand, so the games never depend on it.
const TRYSTERO = 'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr@0.26.0/+esm';
// Relays that pass on ephemeral events (kinds 20000–29999) filtered by tag, with no sign-up, payment or proof
// of work. Every player uses the same list, so any one of them working is enough.
export const RELAYS = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://nostr.mom', 'wss://relay.primal.net', 'wss://relay.nostr.net'];
export const PROTOCOL = 1;

const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => LETTERS[b % LETTERS.length]).join('');
export const validCode = c => typeof c === 'string' && /^[a-z0-9]{6}$/.test(c);

// Join room `code` of `game`. Messages are { t: type, d: data }; `send` goes to everyone, or to one peer.
export async function openRoom(game, code) {
  const { joinRoom, selfId } = await import(TRYSTERO);
  const room = joinRoom({ appId: `hangtime-${game}-${PROTOCOL}`, password: code, relayConfig: { urls: RELAYS, warnOnRelayFailure: false } }, code);
  const msg = room.makeAction('m');
  const handlers = {};
  msg.onMessage = (data, { peerId }) => {
    const fn = handlers[data?.t];
    if (!fn) return;
    try { fn(data.d, peerId); } catch (e) { console.warn('net:', data.t, e); }
  };
  let open = true;
  return {
    self: selfId,
    on(type, fn) { handlers[type] = fn; },
    send(type, d, to) { if (open) msg.send({ t: type, d }, to ? { target: to } : undefined).catch(() => {}); },
    peers: () => Object.keys(room.getPeers()),
    set onJoin(fn) { room.onPeerJoin = fn; },
    set onLeave(fn) { room.onPeerLeave = fn; },
    leave() { if (!open) return; open = false; try { room.leave(); } catch { /* already gone */ } },
  };
}
