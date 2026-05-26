/**
 * Web Serial API — Pico Flash 脚本上传模块
 *
 * 协议:
 *   PC -> Pico:  INFO\n       查询状态
 *   PC -> Pico:  ERASE\n      擦除脚本
 *   PC -> Pico:  WRITE:<size>\n  开始写入
 *   PC -> Pico:  <binary_data>  原始二进制数据
 *   PC -> Pico:  CRC:<crc>\n   校验并写入Flash
 *   Pico -> PC:  OK:...\n      成功
 *   Pico -> PC:  ERR:...\n     错误
 */

export interface PicoInfo {
  firmware: string;
  hasScript: boolean;
  scriptSize: number;
  frames: number;
  estimatedMs: number;
  hidConnected: boolean;
}

export class PicoSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  async connect(): Promise<PicoInfo> {
    this.port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x0F0D }], // HORI CO.,LTD.
    });
    await this.port.open({ baudRate: 115200 });
    this.reader = this.port.readable!.getReader();
    this.writer = this.port.writable!.getWriter();
    return this.getInfo();
  }

  async disconnect(): Promise<void> {
    try { this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
    this.reader = null;
    this.writer = null;
  }

  get connected(): boolean {
    return this.port !== null;
  }

  private async sendCmd(cmd: string): Promise<void> {
    const encoder = new TextEncoder();
    await this.writer!.write(encoder.encode(cmd + '\n'));
  }

  private async readLine(): Promise<string> {
    let buf = '';
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await this.reader!.read();
      if (done) throw new Error('Device disconnected');
      const text = decoder.decode(value, { stream: true });
      buf += text;
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        const line = buf.substring(0, nl).trim();
        // Save remaining for next read
        return line;
      }
    }
  }

  private async readResponse(): Promise<string> {
    const line = await this.readLine();
    if (line.startsWith('ERR:')) {
      throw new Error(line.substring(4));
    }
    return line;
  }

  async getInfo(): Promise<PicoInfo> {
    await this.sendCmd('INFO');
    const result: PicoInfo = {
      firmware: 'unknown',
      hasScript: false,
      scriptSize: 0,
      frames: 0,
      estimatedMs: 0,
      hidConnected: false,
    };

    // Parse multi-line INFO response
    while (true) {
      const line = await this.readLine();
      if (line === 'OK') break;

      const [key, ...rest] = line.split(':');
      const value = rest.join(':');
      switch (key) {
        case 'INFO': result.firmware = value; break;
        case 'SCRIPT': result.hasScript = value === 'LOADED'; break;
        case 'SIZE': result.scriptSize = parseInt(value) || 0; break;
        case 'FRAMES': result.frames = parseInt(value) || 0; break;
        case 'MS': result.estimatedMs = parseInt(value) || 0; break;
        case 'HID': result.hidConnected = value === 'CONNECTED'; break;
      }
    }

    return result;
  }

  async eraseScript(): Promise<void> {
    await this.sendCmd('ERASE');
    await this.readResponse();
  }

  /** 将二进制脚本数据写入 Pico Flash */
  async writeScript(data: Uint8Array, crc32: number): Promise<void> {
    // Step 1: WRITE
    await this.sendCmd(`WRITE:${data.length.toString(16)}`);
    await this.readResponse(); // OK:READY_FOR_DATA

    // Step 2: Send raw binary in chunks
    const CHUNK = 64;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      await this.writer!.write(chunk);
    }
    // Small delay to let Pico process
    await new Promise(r => setTimeout(r, 50));

    // Step 3: CRC
    await this.sendCmd(`CRC:${crc32.toString(16)}`);
    await this.readResponse();
  }

  async startScript(): Promise<void> {
    await this.sendCmd('EXEC');
    await this.readResponse();
  }

  async stopScript(): Promise<void> {
    await this.sendCmd('STOP');
    await this.readResponse();
  }
}

/** 计算 CRC32 (匹配 Pico 固件) */
export function crc32(data: Uint8Array): number {
  if (!_crcTable) _buildCrcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = _crcTable![(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crcTable: Uint32Array | null = null;
function _buildCrcTable(): void {
  _crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    _crcTable![i] = crc;
  }
}
