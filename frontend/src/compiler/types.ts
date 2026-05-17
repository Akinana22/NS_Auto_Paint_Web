import { OpCode, BtnMask, Hat, STICK_CENTER } from '@shared/proto';
import { TimingSnapshot, defaultTiming } from './timing';

export { OpCode, BtnMask, Hat, STICK_CENTER };

export interface Command {
  op: OpCode;
  /** 参数字节 */
  data: number[];
}

export type Instruction = Command;

/** 旧式文本指令 (用于展示/调试) */
export interface TextCmd {
  btn: string;
  totalMs: number;
}
