import { Consent, SmileID, type FetchLike } from '@smileid/smileid';

export interface Env {
  [key: string]: string | undefined;
}

export interface RunOptions {
  argv: string[];
  env?: Env;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  fetch?: FetchLike;
}

interface AppConfig {
  partnerId: string;
  apiKey: string;
  partnerSecret?: string;
  baseUrl?: string;
  callbackUrl?: string;
  timeout: number;
  fetch?: FetchLike;
}

export class UsageError extends Error {}

export async function run(options: RunOptions): Promise<void> {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const { config, command, args } = parseGlobalFlags(options.argv, env, options.fetch);

  if (!command) {
    throw new UsageError('missing command; run one of: services, enhanced-kyc, status, replay');
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    stdout.write(usage());
    return;
  }

  validateConfig(config);
  const smile = new SmileID({
    partnerId: config.partnerId,
    apiKey: config.apiKey,
    partnerSecret: config.partnerSecret,
    baseUrl: config.baseUrl,
    defaultCallbackUrl: config.callbackUrl,
    timeout: config.timeout,
    fetch: config.fetch,
  });

  switch (command) {
    case 'services':
      await runServices(smile, args, stdout);
      return;
    case 'enhanced-kyc':
      await runEnhancedKyc(smile, args, config, stdout);
      return;
    case 'status':
      await runStatus(smile, args, stdout);
      return;
    case 'replay':
      await runReplay(smile, args, stdout);
      return;
    default:
      stderr.write(`unknown command ${command}\n`);
      throw new UsageError(`unknown command ${command}`);
  }
}

function parseGlobalFlags(argv: string[], env: Env, fetchImpl?: FetchLike): {
  config: AppConfig;
  command: string | undefined;
  args: string[];
} {
  const config: AppConfig = {
    partnerId: env.SMILE_PARTNER_ID ?? '',
    apiKey: env.SMILE_API_KEY ?? '',
    partnerSecret: env.SMILE_PARTNER_SECRET,
    baseUrl: env.SMILE_BASE_URL,
    callbackUrl: env.SMILE_CALLBACK_URL,
    timeout: Number(env.SMILE_TIMEOUT_MS ?? '30000'),
    fetch: fetchImpl,
  };
  const args = [...argv];
  while (args[0]?.startsWith('--')) {
    const flag = args.shift();
    if (!flag) break;
    const value = args.shift() ?? '';
    switch (flag) {
      case '--partner-id':
        config.partnerId = value;
        break;
      case '--api-key':
        config.apiKey = value;
        break;
      case '--partner-secret':
        config.partnerSecret = value;
        break;
      case '--base-url':
        config.baseUrl = value;
        break;
      case '--callback-url':
        config.callbackUrl = value;
        break;
      case '--timeout-ms':
        config.timeout = Number(value);
        break;
      default:
        throw new UsageError(`unknown global flag ${flag}`);
    }
  }
  return { config, command: args.shift(), args };
}

function validateConfig(config: AppConfig): void {
  const missing = [];
  if (!config.partnerId) missing.push('SMILE_PARTNER_ID or --partner-id');
  if (!config.apiKey) missing.push('SMILE_API_KEY or --api-key');
  if (missing.length > 0) {
    throw new UsageError(`missing ${missing.join(' and ')}`);
  }
  if (!Number.isFinite(config.timeout) || config.timeout <= 0) {
    throw new UsageError('timeout must be a positive number of milliseconds');
  }
}

async function runServices(smile: SmileID, args: string[], stdout: NodeJS.WritableStream): Promise<void> {
  const country = stringFlag(args, '--country') ?? 'NG';
  const [banks, idTypes, docs] = await Promise.all([
    smile.services.bankCodes({ country }),
    smile.services.supportedIdTypes({ country }),
    smile.services.supportedDocuments({ countryCode: country }),
  ]);
  writeJson(stdout, {
    country,
    bankCodes: banks.bankCodes,
    idTypes: idTypes.idTypes,
    documents: docs.validDocuments,
  });
}

async function runEnhancedKyc(
  smile: SmileID,
  args: string[],
  config: AppConfig,
  stdout: NodeJS.WritableStream,
): Promise<void> {
  const country = stringFlag(args, '--country') ?? 'NG';
  const idType = requiredFlag(args, '--id-type');
  const idNumber = requiredFlag(args, '--id-number');
  const givenNames = requiredFlag(args, '--given-names');
  const lastName = requiredFlag(args, '--last-name');
  const email = stringFlag(args, '--email');
  const phoneNumber = stringFlag(args, '--phone-number');
  const privacyUrl = stringFlag(args, '--privacy-url') ?? 'https://example.com/privacy';
  const callbackUrl = stringFlag(args, '--callback-url', config.callbackUrl);

  const accepted = await smile.enhancedKyc.verify({
    country,
    idType,
    idNumber,
    userDetails: { givenNames, lastName, ...(email ? { email } : {}), ...(phoneNumber ? { phoneNumber } : {}) },
    consent: Consent.granted({
      grantedAt: new Date(),
      noticeLanguage: 'EN',
      noticePrivacyPolicyUrl: privacyUrl,
    }),
    ...(callbackUrl ? { callbackUrl } : {}),
  });
  writeJson(stdout, {
    status: accepted.status,
    message: accepted.message,
    jobId: accepted.jobId,
    userId: accepted.userId,
    accepted: accepted.isAccepted,
  });
}

async function runStatus(smile: SmileID, args: string[], stdout: NodeJS.WritableStream): Promise<void> {
  const jobId = stringFlag(args, '--job-id') ?? args[0];
  if (!jobId) throw new UsageError('status requires --job-id');
  const status = await smile.verifications.retrieve(jobId);
  writeJson(stdout, {
    status: status.status,
    message: status.message,
    jobId: status.jobId,
    userId: status.userId,
  });
}

async function runReplay(smile: SmileID, args: string[], stdout: NodeJS.WritableStream): Promise<void> {
  const jobId = stringFlag(args, '--job-id') ?? args[0];
  if (!jobId) throw new UsageError('replay requires --job-id');
  const callbackUrl = stringFlag(args, '--callback-url');
  const replay = await smile.verifications.replay(jobId, callbackUrl ? { callbackUrl } : undefined);
  writeJson(stdout, {
    status: replay.status,
    message: replay.message,
    jobId: replay.jobId,
    userId: replay.userId,
  });
}

function requiredFlag(args: string[], name: string): string {
  const value = stringFlag(args, name);
  if (!value) throw new UsageError(`${name} is required`);
  return value;
}

function stringFlag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] || fallback;
}

function writeJson(stdout: NodeJS.WritableStream, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function usage(): string {
  return `Usage:
  smileid-example-js [global flags] services --country NG
  smileid-example-js [global flags] enhanced-kyc --country NG --id-type NIN --id-number 12345678901 --given-names Amina --last-name Okafor --email amina@example.com --privacy-url https://example.com/privacy
  smileid-example-js [global flags] status --job-id job_...
  smileid-example-js [global flags] replay --job-id job_... --callback-url https://example.com/webhook

Global flags can also be set with SMILE_PARTNER_ID, SMILE_API_KEY, SMILE_PARTNER_SECRET, SMILE_BASE_URL, SMILE_CALLBACK_URL and SMILE_TIMEOUT_MS.
`;
}
