/**
 * Snowflake ID 生成器
 *
 * 结构 (64 bits):
 * - 1 bit: 符号位 (固定为0)
 * - 41 bits: 时间戳 (毫秒级，可用约69年)
 * - 5 bits: 数据中心ID (0-31)
 * - 5 bits: 机器ID (0-31)
 * - 12 bits: 序列号 (0-4095，同毫秒内递增)
 */

export class SnowflakeIdGenerator {
  // 起始时间戳 (2024-01-01 00:00:00 UTC)
  private static readonly EPOCH = 1704067200000n;

  private static readonly SEQUENCE_BITS = 12n;
  private static readonly MACHINE_ID_BITS = 5n;
  private static readonly DATACENTER_ID_BITS = 5n;

  private static readonly MAX_SEQUENCE = (1n << SnowflakeIdGenerator.SEQUENCE_BITS) - 1n;
  private static readonly MAX_MACHINE_ID = (1n << SnowflakeIdGenerator.MACHINE_ID_BITS) - 1n;
  private static readonly MAX_DATACENTER_ID = (1n << SnowflakeIdGenerator.DATACENTER_ID_BITS) - 1n;

  private static readonly MACHINE_ID_SHIFT = SnowflakeIdGenerator.SEQUENCE_BITS;
  private static readonly DATACENTER_ID_SHIFT =
    SnowflakeIdGenerator.SEQUENCE_BITS + SnowflakeIdGenerator.MACHINE_ID_BITS;
  private static readonly TIMESTAMP_SHIFT =
    SnowflakeIdGenerator.SEQUENCE_BITS +
    SnowflakeIdGenerator.MACHINE_ID_BITS +
    SnowflakeIdGenerator.DATACENTER_ID_BITS;

  private datacenterId: bigint;
  private machineId: bigint;
  private sequence: bigint = 0n;
  private lastTimestamp: bigint = -1n;

  constructor(machineId: number = 1, datacenterId: number = 1) {
    if (machineId < 0 || BigInt(machineId) > SnowflakeIdGenerator.MAX_MACHINE_ID) {
      throw new Error(`Machine ID must be between 0 and ${SnowflakeIdGenerator.MAX_MACHINE_ID}`);
    }
    if (datacenterId < 0 || BigInt(datacenterId) > SnowflakeIdGenerator.MAX_DATACENTER_ID) {
      throw new Error(`Datacenter ID must be between 0 and ${SnowflakeIdGenerator.MAX_DATACENTER_ID}`);
    }
    this.machineId = BigInt(machineId);
    this.datacenterId = BigInt(datacenterId);
  }

  nextId(): bigint {
    let timestamp = this.currentTimestamp();

    if (timestamp < this.lastTimestamp) {
      const offset = this.lastTimestamp - timestamp;
      if (offset <= 5n) {
        this.sleep(Number(offset) + 1);
        timestamp = this.currentTimestamp();
      } else {
        throw new Error(`Clock moved backwards. Refusing to generate id for ${offset}ms`);
      }
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & SnowflakeIdGenerator.MAX_SEQUENCE;
      if (this.sequence === 0n) {
        timestamp = this.waitNextMillis(this.lastTimestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    return (
      ((timestamp - SnowflakeIdGenerator.EPOCH) << SnowflakeIdGenerator.TIMESTAMP_SHIFT) |
      (this.datacenterId << SnowflakeIdGenerator.DATACENTER_ID_SHIFT) |
      (this.machineId << SnowflakeIdGenerator.MACHINE_ID_SHIFT) |
      this.sequence
    );
  }

  nextIdString(): string {
    return this.nextId().toString();
  }

  private currentTimestamp(): bigint {
    return BigInt(Date.now());
  }

  private waitNextMillis(lastTimestamp: bigint): bigint {
    let timestamp = this.currentTimestamp();
    while (timestamp <= lastTimestamp) {
      timestamp = this.currentTimestamp();
    }
    return timestamp;
  }

  private sleep(ms: number): void {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

let instance: SnowflakeIdGenerator | null = null;

export function getSnowflakeGenerator(): SnowflakeIdGenerator {
  if (!instance) {
    const machineId = parseInt(process.env.SNOWFLAKE_MACHINE_ID || '1', 10);
    const datacenterId = parseInt(process.env.SNOWFLAKE_DATACENTER_ID || '1', 10);
    instance = new SnowflakeIdGenerator(machineId, datacenterId);
  }
  return instance;
}
