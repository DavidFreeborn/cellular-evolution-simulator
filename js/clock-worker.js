// Rendering stops in a background tab. This worker supplies a separate heartbeat;
// the main thread accounts for elapsed time if delivery is delayed by the browser.
let timer = null;
self.onmessage = ({ data }) => {
    if (timer !== null) clearInterval(timer);
    timer = data === 'start' ? setInterval(() => self.postMessage('tick'), 50) : null;
};
