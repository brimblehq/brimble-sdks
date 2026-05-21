import { CodeLanguage } from '../enums';

export type ExecInput = {
  cmd: string;
  timeout_seconds?: number;
  cwd?: string;
  stream?: boolean;
};

export type CodeInput = {
  language: CodeLanguage;
  code: string;
  timeout_seconds?: number;
  cwd?: string;
  stream?: boolean;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
};

export type ExecStreamFrame =
  | {
      type: 'stdout';
      data: string;
    }
  | {
      type: 'stderr';
      data: string;
    }
  | {
      type: 'done';
      exit_code: number;
      duration_ms: number;
    }
  | {
      type: 'error';
      message: string;
    };
