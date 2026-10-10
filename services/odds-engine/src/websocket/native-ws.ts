import { createHash } from 'crypto';
import { IncomingMessage, Server } from 'http';
import { Socket } from 'net';
import { EventEmitter } from 'events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class NativeWebSocketClient extends EventEmitter {
  public socket: Socket;
  public readyState: number = 1; // 1 = OPEN, 3 = CLOSED
  public static OPEN = 1;
  public static CLOSED = 3;

  constructor(socket: Socket) {
    super();
    this.socket = socket;
    this.setupSocket();
  }

  private setupSocket(): void {
    let buffer = Buffer.alloc(0);

    this.socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = this.processFrames(buffer);
    });

    this.socket.on('close', () => {
      this.readyState = NativeWebSocketClient.CLOSED;
      this.emit('close');
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private processFrames(buffer: Buffer): Buffer {
    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];

      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < offset + 2) break;
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (buffer.length < offset + 8) break;
        payloadLength = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let maskingKey: Buffer | null = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        maskingKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLength) {
        break; // Wait for full frame
      }

      const payload = buffer.subarray(offset, offset + payloadLength);
      buffer = buffer.subarray(offset + payloadLength);

      // Unmask if masked
      if (isMasked && maskingKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskingKey[i % 4];
        }
      }

      // Handle Opcode
      if (opcode === 0x1) {
        // Text Frame
        this.emit('message', payload);
      } else if (opcode === 0x8) {
        // Close Frame
        this.close();
      } else if (opcode === 0x9) {
        // Ping -> Reply Pong (0xA)
        this.sendFrame(0xA, payload);
      }
    }
    return buffer;
  }

  public send(data: string): void {
    if (this.readyState !== NativeWebSocketClient.OPEN) return;
    const payload = Buffer.from(data, 'utf8');
    this.sendFrame(0x1, payload);
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    const payloadLength = payload.length;
    let header: Buffer;

    if (payloadLength <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode; // FIN + opcode
      header[1] = payloadLength;
    } else if (payloadLength <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(payloadLength, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(payloadLength), 2);
    }

    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      this.close();
    }
  }

  public close(): void {
    if (this.readyState === NativeWebSocketClient.OPEN) {
      this.readyState = NativeWebSocketClient.CLOSED;
      try {
        const closeFrame = Buffer.from([0x88, 0x00]);
        this.socket.write(closeFrame);
        this.socket.end();
      } catch {
        // ignore
      }
      this.emit('close');
    }
  }
}

export class NativeWebSocketServer extends EventEmitter {
  private server: Server;
  private path: string;

  constructor(options: { server: Server; path?: string }) {
    super();
    this.server = options.server;
    this.path = options.path || '/ws';
    this.setupUpgradeHandler();
  }

  private setupUpgradeHandler(): void {
    this.server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== this.path) {
        socket.destroy();
        return;
      }

      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      const acceptValue = createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptValue}`,
      ];

      socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

      const client = new NativeWebSocketClient(socket);
      if (head && head.length > 0) {
        socket.emit('data', head);
      }
      this.emit('connection', client, req);
    });
  }

  public close(): void {
    // server shutdown
  }
}
