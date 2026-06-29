import { CodeLanguage } from '../enums';

export type ExecStreamCallbacks = {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export type ExecInput = {
  cmd: string;
  timeout_seconds?: number;
  cwd?: string;
  stream?: boolean;
  env?: Record<string, string>;
} & ExecStreamCallbacks;

export type CodeInput = {
  language: CodeLanguage;
  code: string;
  timeout_seconds?: number;
  cwd?: string;
  stream?: boolean;
  env?: Record<string, string>;
} & ExecStreamCallbacks;

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
