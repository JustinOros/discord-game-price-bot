const dgram = require("dgram");

const TIMEOUT_MS = 2500;
const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function infoRequest(challenge) {
  const base = Buffer.concat([HEADER, Buffer.from([0x54]), Buffer.from("Source Engine Query\0", "latin1")]);
  return challenge ? Buffer.concat([base, challenge]) : base;
}

function readString(buffer, offset) {
  const end = buffer.indexOf(0, offset);
  if (end === -1) return null;
  return { value: buffer.toString("utf8", offset, end), next: end + 1 };
}

function parseInfo(buffer) {
  if (buffer.length < 6 || buffer.readInt32LE(0) !== -1 || buffer[4] !== 0x49) return null;
  let offset = 6;
  let name = "";
  for (let i = 0; i < 4; i++) {
    const field = readString(buffer, offset);
    if (!field) return null;
    if (i === 0) name = field.value;
    offset = field.next;
  }
  offset += 2;
  if (offset + 1 >= buffer.length) return null;
  return { name: name, players: buffer[offset], max: buffer[offset + 1] };
}

function queryInfo(host, port) {
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    let timer = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch (err) {
        settled = true;
      }
      resolve(value);
    };

    try {
      socket = dgram.createSocket("udp4");
    } catch (err) {
      resolve(null);
      return;
    }

    timer = setTimeout(() => finish(null), TIMEOUT_MS);
    socket.on("error", () => finish(null));
    socket.on("message", (buffer) => {
      if (buffer.length >= 9 && buffer.readInt32LE(0) === -1 && buffer[4] === 0x41) {
        socket.send(infoRequest(buffer.subarray(5, 9)), port, host);
        return;
      }
      finish(parseInfo(buffer));
    });
    socket.send(infoRequest(null), port, host, (err) => {
      if (err) finish(null);
    });
  });
}

module.exports = { queryInfo, parseInfo };
