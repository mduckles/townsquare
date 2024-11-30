const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const { URL } = require("url");
const WebSocket = require("ws");
const client = require("prom-client");

// Create a Registry which registers the metrics
const register = new client.Registry();
// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "clocktower-online",
});

const PING_INTERVAL = 30000; // 30 seconds

const options = {};

if (process.env.NODE_ENV !== "nossl") {
  options.cert = fs.readFileSync(
    "/etc/letsencrypt/live/clocktower.live/fullchain.pem",
  );
  options.key = fs.readFileSync(
    "/etc/letsencrypt/live/clocktower.live/privkey.pem",
  );
}

function escapeRegExp(string) {
	  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Set regex for matching hostnames to keep WS server secure
if ('CT_HOSTNAME' in process.env) {
	const allowedDomain = process.env.CT_HOSTNAME ? escapeRegExp(process.env.CT_HOSTNAME) : null;
	const regex = new RegExp(`^https?:\/\/(localhost${allowedDomain ? `|${allowedDomain}` : ''})`, 'i');
	console.log("Using custom host match", regex);
} else {
	const regex = /^https?:\/\/([^.]+\.github\.io|localhost|clocktower\.live)/i ;
	console.log("Using default host match", regex);
}

const server = https.createServer(options);
const wss = new WebSocket.Server({
  ...(process.env.NODE_ENV === "nossl" ? { port: 8001 } : { server }),
  verifyClient: (info) =>
    info.origin &&
    !!info.origin.match(
	regex
    ),
});

function noop() {}

// calculate latency on heartbeat
function heartbeat() {
  this.latency = Math.round((new Date().getTime() - this.pingStart) / 2);
  this.counter = 0;
  this.isAlive = true;
}

// map of channels currently in use
const channels = {};

// metrics
const metrics = {
  players_concurrent: new client.Gauge({
    name: "players_concurrent",
    help: "Concurrent Players",
    collect() {
      this.set(wss.clients.size);
    },
  }),
  channels_concurrent: new client.Gauge({
    name: "channels_concurrent",
    help: "Concurrent Channels",
    collect() {
      this.set(Object.keys(channels).length);
    },
  }),
  channels_list: new client.Gauge({
    name: "channel_players",
    help: "Players in each channel",
    labelNames: ["name"],
    collect() {
      for (let channel in channels) {
        this.set(
          { name: channel },
          channels[channel].filter(
            (ws) =>
              ws &&
              (ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING),
          ).length,
        );
      }
    },
  }),
  messages_incoming: new client.Counter({
    name: "messages_incoming",
    help: "Incoming messages",
  }),
  messages_outgoing: new client.Counter({
    name: "messages_outgoing",
    help: "Outgoing messages",
  }),
  connection_terminated_host: new client.Counter({
    name: "connection_terminated_host",
    help: "Terminated connection due to host already present",
  }),
  connection_terminated_spam: new client.Counter({
    name: "connection_terminated_spam",
    help: "Terminated connection due to message spam",
  }),
  connection_terminated_timeout: new client.Counter({
    name: "connection_terminated_timeout",
    help: "Terminated connection due to timeout",
  }),
  connection_terminated_player_validate: new client.Counter({
    name: "connection_terminated_player_validate",
    help: "Terminated connection due to player validation failure",
  }),
};

// register metrics
for (let metric in metrics) {
  register.registerMetric(metrics[metric]);
}

// a new client connects
wss.on("connection", function connection(ws, req) {
  // url pattern: clocktower.live/<channel>/<playerId|host>
  const url = new URL(req.url, "wss://clocktower.live/");
  [ws.channel, ws.playerId] = url.pathname
    .replace(/^\//, "")
    .split("/")
    .map((c) => decodeURIComponent(c));
  ws.channel = ws.channel.toLowerCase();
  // check for another host on this channel
  if (
    ws.playerId === "host" &&
    channels[ws.channel] &&
    channels[ws.channel].some(
      (client) =>
        client !== ws &&
        client.readyState === WebSocket.OPEN &&
        client.playerId === "host",
    )
  ) {
    console.log(ws.channel, "duplicate host");
    ws.close(1000, `The channel "${ws.channel}" already has a host`);
    metrics.connection_terminated_host.inc();
    return;
  }
  // Validate the player ID to confirm it's not an impersonation.
  if (ws.playerId && ws.playerId.indexOf("__s_") === 0) {
    let correctPlayerId;
    let rawSecret = url.searchParams.get("secret");
    if (rawSecret) {
      let playerSecret = new Uint8Array(Buffer.from(rawSecret, "base64url"));
      const digestInput = new Uint8Array([
        155,
        113,
        7,
        193,
        229,
        225,
        124,
        147,
        153,
        27,
        254,
        60,
        164,
        234,
        108,
        10,
        ...playerSecret,
      ]);
      correctPlayerId =
        "__s_" +
        crypto.createHash("sha256").update(digestInput).digest("base64url");
    }
    if (ws.playerId !== correctPlayerId) {
      console.log(
        ws.channel,
        ws.playerId,
        ws._socket.remoteAddress,
        "possible player impersonation rejected",
      );
      ws.close(1000, "Player secret failed to validate.");
      metrics.connection_terminated_player_validate.inc();
      return;
    }
  }
  ws.isAlive = true;
  ws.pingStart = new Date().getTime();
  ws.counter = 0;
  // add channel to list
  if (!channels[ws.channel]) {
    channels[ws.channel] = [];
  }
  channels[ws.channel].push(ws);
  // start ping pong
  ws.ping(noop);
  ws.on("pong", heartbeat);
  // handle message
  ws.on("message", function incoming(data) {
    metrics.messages_incoming.inc();
    // check rate limit (max 5msg/second)
    ws.counter++;
    if (ws.counter > (5 * PING_INTERVAL) / 1000) {
      console.log(ws.channel, "disconnecting user due to spam");
      ws.close(
        1000,
        "Your app seems to be malfunctioning, please clear your browser cache.",
      );
      metrics.connection_terminated_spam.inc();
      return;
    }
    const messageType = data.toLocaleLowerCase().substr(1).split(",", 1).pop();
    switch (messageType) {
      case '"ping"':
        // ping messages will only be sent host -> all or all -> host
        channels[ws.channel].forEach(function each(client) {
          if (
            client !== ws &&
            client.readyState === WebSocket.OPEN &&
            (ws.playerId === "host" || client.playerId === "host")
          ) {
            client.send(
              data.replace(
                /latency/,
                (client.latency || 0) + (ws.latency || 0),
              ),
            );
            metrics.messages_outgoing.inc();
          }
        });
        break;
      case '"direct"':
        // handle "direct" messages differently
        console.log(
          new Date(),
          wss.clients.size,
          ws.channel,
          ws.playerId,
          ws._socket.remoteAddress,
          data,
        );
        try {
          const dataToPlayer = JSON.parse(data)[1];
          channels[ws.channel].forEach(function each(client) {
            if (
              client !== ws &&
              client.readyState === WebSocket.OPEN &&
              dataToPlayer[client.playerId]
            ) {
              client.send(JSON.stringify(dataToPlayer[client.playerId]));
              metrics.messages_outgoing.inc();
            }
          });
        } catch (e) {
          console.log("error parsing direct message JSON", e);
        }
        break;
      default:
        // all other messages
        console.log(
          new Date(),
          wss.clients.size,
          ws.channel,
          ws.playerId,
          data,
        );
        channels[ws.channel].forEach(function each(client) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
            metrics.messages_outgoing.inc();
          }
        });
        break;
    }
  });
});

// start ping interval timer
const interval = setInterval(function ping() {
  // ping each client
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      metrics.connection_terminated_timeout.inc();
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.pingStart = new Date().getTime();
    ws.ping(noop);
  });
  // clean up empty channels
  for (let channel in channels) {
    if (
      !channels[channel].length ||
      !channels[channel].some(
        (ws) =>
          ws &&
          (ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING),
      )
    ) {
      metrics.channels_list.remove({ name: channel });
      delete channels[channel];
    }
  }
}, PING_INTERVAL);

// handle server shutdown
wss.on("close", function close() {
  clearInterval(interval);
});

// prod mode with stats API
if (process.env.NODE_ENV !== "nossl") {
  console.log("server starting");
  server.listen(8001);
  server.on("request", (req, res) => {
    res.setHeader("Content-Type", register.contentType);
    register.metrics().then((out) => res.end(out));
  });
}
