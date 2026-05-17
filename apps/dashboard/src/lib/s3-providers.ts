/** Rclone S3 backend provider keys for S3-compatible object storage. */
export const S3_PROVIDERS: ReadonlyArray<{ key: string; name: string }> = [
  { key: "AWS", name: "Amazon Web Services (AWS) S3" },
  {
    key: "Alibaba",
    name: "Alibaba Cloud Object Storage System (OSS) formerly Aliyun",
  },
  { key: "ArvanCloud", name: "Arvan Cloud Object Storage (AOS)" },
  { key: "Ceph", name: "Ceph Object Storage" },
  {
    key: "ChinaMobile",
    name: "China Mobile Ecloud Elastic Object Storage (EOS)",
  },
  { key: "Cloudflare", name: "Cloudflare R2 Storage" },
  { key: "DigitalOcean", name: "DigitalOcean Spaces" },
  { key: "Dreamhost", name: "Dreamhost DreamObjects" },
  { key: "GCS", name: "Google Cloud Storage" },
  { key: "HuaweiOBS", name: "Huawei Object Storage Service" },
  { key: "IBMCOS", name: "IBM COS S3" },
  { key: "IDrive", name: "IDrive e2" },
  { key: "IONOS", name: "IONOS Cloud" },
  { key: "LyveCloud", name: "Seagate Lyve Cloud" },
  { key: "Leviia", name: "Leviia Object Storage" },
  { key: "Liara", name: "Liara Object Storage" },
  { key: "Linode", name: "Linode Object Storage" },
  { key: "Magalu", name: "Magalu Object Storage" },
  { key: "Minio", name: "Minio Object Storage" },
  { key: "Netease", name: "Netease Object Storage (NOS)" },
  { key: "Petabox", name: "Petabox Object Storage" },
  { key: "RackCorp", name: "RackCorp Object Storage" },
  { key: "Rclone", name: "Rclone S3 Server" },
  { key: "Scaleway", name: "Scaleway Object Storage" },
  { key: "SeaweedFS", name: "SeaweedFS S3" },
  { key: "StackPath", name: "StackPath Object Storage" },
  { key: "Storj", name: "Storj (S3 Compatible Gateway)" },
  { key: "Synology", name: "Synology C2 Object Storage" },
  { key: "TencentCOS", name: "Tencent Cloud Object Storage (COS)" },
  { key: "Wasabi", name: "Wasabi Object Storage" },
  { key: "Qiniu", name: "Qiniu Object Storage (Kodo)" },
  { key: "Other", name: "Any other S3 compatible provider" },
];

export function s3ProviderLabel(key: string | null): string {
  if (!key) return "—";
  const entry = S3_PROVIDERS.find((p) => p.key === key);
  return entry?.name ?? key;
}

/**
 * Per-provider UI descriptor. Field UX (labels, placeholders, helper text,
 * region presets, endpoint auto-fill) varies per provider while the underlying
 * row stays the same (provider, accessKey, secretAccessKey, bucket, region,
 * endpoint, additionalFlags). Some providers expose an extra "helper" field
 * (e.g. R2 account ID) that derives the endpoint.
 */
export interface S3ProviderRegion {
  label: string;
  value: string;
}

export interface S3ProviderHelperField {
  /** Field id used in the helper state, e.g. "accountId". */
  key: string;
  label: string;
  placeholder?: string;
  helpText?: string;
}

export interface S3ProviderDescriptor {
  /** Label for the access key input. */
  accessKeyLabel: string;
  accessKeyPlaceholder?: string;
  /** Label for the secret key input. */
  secretKeyLabel: string;
  secretKeyPlaceholder?: string;
  /** Label for the bucket input. */
  bucketLabel: string;
  bucketPlaceholder?: string;
  /** Label for the region input. */
  regionLabel: string;
  regionPlaceholder?: string;
  /** Optional region presets — when provided, region renders as a select. */
  regions?: ReadonlyArray<S3ProviderRegion>;
  /** Default region value applied when switching to this provider. */
  defaultRegion?: string;
  /** Label for the endpoint input. */
  endpointLabel: string;
  endpointPlaceholder?: string;
  /** Default endpoint value (constant). */
  defaultEndpoint?: string;
  /** Hide the endpoint field entirely (computed from region/helper). */
  endpointHidden?: boolean;
  /** Endpoint template using `{region}` / helper field tokens like `{accountId}`. */
  endpointTemplate?: string;
  /** Provider-specific helper fields rendered above credentials. */
  helperFields?: ReadonlyArray<S3ProviderHelperField>;
  /** Short top-of-form note shown when this provider is selected. */
  note?: string;
}

const defaultDescriptor: S3ProviderDescriptor = {
  accessKeyLabel: "Access key ID",
  accessKeyPlaceholder: "AKIA…",
  secretKeyLabel: "Secret access key",
  bucketLabel: "Bucket",
  bucketPlaceholder: "my-bucket",
  regionLabel: "Region",
  regionPlaceholder: "us-east-1",
  endpointLabel: "Endpoint",
  endpointPlaceholder: "https://…",
};

const awsRegions: ReadonlyArray<S3ProviderRegion> = [
  { label: "US East (N. Virginia) · us-east-1", value: "us-east-1" },
  { label: "US East (Ohio) · us-east-2", value: "us-east-2" },
  { label: "US West (N. California) · us-west-1", value: "us-west-1" },
  { label: "US West (Oregon) · us-west-2", value: "us-west-2" },
  { label: "EU (Ireland) · eu-west-1", value: "eu-west-1" },
  { label: "EU (London) · eu-west-2", value: "eu-west-2" },
  { label: "EU (Paris) · eu-west-3", value: "eu-west-3" },
  { label: "EU (Frankfurt) · eu-central-1", value: "eu-central-1" },
  { label: "EU (Stockholm) · eu-north-1", value: "eu-north-1" },
  { label: "Asia Pacific (Tokyo) · ap-northeast-1", value: "ap-northeast-1" },
  { label: "Asia Pacific (Seoul) · ap-northeast-2", value: "ap-northeast-2" },
  {
    label: "Asia Pacific (Singapore) · ap-southeast-1",
    value: "ap-southeast-1",
  },
  { label: "Asia Pacific (Sydney) · ap-southeast-2", value: "ap-southeast-2" },
  { label: "Asia Pacific (Mumbai) · ap-south-1", value: "ap-south-1" },
  { label: "South America (São Paulo) · sa-east-1", value: "sa-east-1" },
  { label: "Canada (Central) · ca-central-1", value: "ca-central-1" },
];

const digitalOceanRegions: ReadonlyArray<S3ProviderRegion> = [
  { label: "New York 3 · nyc3", value: "nyc3" },
  { label: "San Francisco 3 · sfo3", value: "sfo3" },
  { label: "Amsterdam 3 · ams3", value: "ams3" },
  { label: "Frankfurt 1 · fra1", value: "fra1" },
  { label: "Singapore 1 · sgp1", value: "sgp1" },
  { label: "Sydney 1 · syd1", value: "syd1" },
  { label: "Bangalore 1 · blr1", value: "blr1" },
  { label: "Toronto 1 · tor1", value: "tor1" },
];

const wasabiRegions: ReadonlyArray<S3ProviderRegion> = [
  { label: "US East 1 · us-east-1", value: "us-east-1" },
  { label: "US East 2 · us-east-2", value: "us-east-2" },
  { label: "US Central 1 · us-central-1", value: "us-central-1" },
  { label: "US West 1 · us-west-1", value: "us-west-1" },
  { label: "EU Central 1 (Amsterdam) · eu-central-1", value: "eu-central-1" },
  { label: "EU West 1 (London) · eu-west-1", value: "eu-west-1" },
  { label: "EU West 2 (Paris) · eu-west-2", value: "eu-west-2" },
  { label: "AP Northeast 1 (Tokyo) · ap-northeast-1", value: "ap-northeast-1" },
  {
    label: "AP Northeast 2 (Osaka) · ap-northeast-2",
    value: "ap-northeast-2",
  },
  {
    label: "AP Southeast 1 (Singapore) · ap-southeast-1",
    value: "ap-southeast-1",
  },
  {
    label: "AP Southeast 2 (Sydney) · ap-southeast-2",
    value: "ap-southeast-2",
  },
];

const linodeRegions: ReadonlyArray<S3ProviderRegion> = [
  { label: "Atlanta · us-southeast-1", value: "us-southeast-1" },
  { label: "Chicago · us-ord-1", value: "us-ord-1" },
  { label: "Dallas · us-mia-1", value: "us-mia-1" },
  { label: "Newark · us-east-1", value: "us-east-1" },
  { label: "Frankfurt · eu-central-1", value: "eu-central-1" },
  { label: "Amsterdam · nl-ams-1", value: "nl-ams-1" },
  { label: "Stockholm · se-sto-1", value: "se-sto-1" },
  { label: "Milan · it-mil-1", value: "it-mil-1" },
  { label: "Paris · fr-par-1", value: "fr-par-1" },
  { label: "Singapore · ap-south-1", value: "ap-south-1" },
];

const scalewayRegions: ReadonlyArray<S3ProviderRegion> = [
  { label: "Paris · fr-par", value: "fr-par" },
  { label: "Amsterdam · nl-ams", value: "nl-ams" },
  { label: "Warsaw · pl-waw", value: "pl-waw" },
];

const cloudflareRegions: ReadonlyArray<S3ProviderRegion> = [
  { label: "Auto (default)", value: "auto" },
  { label: "Western Europe (WEUR)", value: "weur" },
  { label: "Eastern Europe (EEUR)", value: "eeur" },
  { label: "Eastern North America (ENAM)", value: "enam" },
  { label: "Western North America (WNAM)", value: "wnam" },
  { label: "Asia Pacific (APAC)", value: "apac" },
];

const providerDescriptors: Record<string, Partial<S3ProviderDescriptor>> = {
  AWS: {
    accessKeyPlaceholder: "AKIA…",
    regions: awsRegions,
    defaultRegion: "us-east-1",
    endpointPlaceholder: "Leave blank for default (s3.<region>.amazonaws.com)",
    endpointHidden: true,
  },
  Cloudflare: {
    note: "Find your account ID on the Cloudflare R2 dashboard. The endpoint is generated from it.",
    helperFields: [
      {
        key: "accountId",
        label: "Account ID",
        placeholder: "e.g. 0a1b2c3d4e5f…",
        helpText: "Used to build the R2 endpoint URL.",
      },
    ],
    accessKeyLabel: "R2 Access Key ID",
    secretKeyLabel: "R2 Secret Access Key",
    regions: cloudflareRegions,
    defaultRegion: "auto",
    endpointTemplate: "https://{accountId}.r2.cloudflarestorage.com",
    endpointPlaceholder: "https://<account-id>.r2.cloudflarestorage.com",
  },
  GCS: {
    note: "Use HMAC interoperability keys from Cloud Storage settings (not a service-account JSON file).",
    accessKeyLabel: "HMAC Access ID",
    accessKeyPlaceholder: "GOOG1E…",
    secretKeyLabel: "HMAC Secret",
    defaultEndpoint: "https://storage.googleapis.com",
    endpointPlaceholder: "https://storage.googleapis.com",
    regionPlaceholder: "us-central1",
  },
  DigitalOcean: {
    note: "Endpoint is generated from the selected region.",
    regions: digitalOceanRegions,
    defaultRegion: "nyc3",
    endpointTemplate: "https://{region}.digitaloceanspaces.com",
    endpointHidden: true,
  },
  Wasabi: {
    regions: wasabiRegions,
    defaultRegion: "us-east-1",
    endpointTemplate: "https://s3.{region}.wasabisys.com",
    endpointHidden: true,
  },
  Linode: {
    regions: linodeRegions,
    defaultRegion: "us-east-1",
    endpointTemplate: "https://{region}.linodeobjects.com",
    endpointHidden: true,
  },
  Scaleway: {
    regions: scalewayRegions,
    defaultRegion: "fr-par",
    endpointTemplate: "https://s3.{region}.scw.cloud",
    endpointHidden: true,
  },
  Storj: {
    note: "Storj S3 gateway uses a single global endpoint.",
    defaultEndpoint: "https://gateway.storjshare.io",
    endpointPlaceholder: "https://gateway.storjshare.io",
    regionPlaceholder: "us-east-1",
  },
  IDrive: {
    note: "Use the endpoint URL shown in your IDrive e2 dashboard.",
    endpointPlaceholder: "https://<region>.idrivee2-XX.com",
    regionPlaceholder: "Free-form (e.g. us-west-1)",
  },
  Minio: {
    note: "Point endpoint at your MinIO server (or load-balancer).",
    endpointPlaceholder: "https://minio.example.com",
    regionPlaceholder: "us-east-1",
  },
  Other: {
    note: "Provide the endpoint URL exposed by your S3-compatible provider.",
    endpointPlaceholder: "https://…",
  },
};

export function getS3ProviderDescriptor(key: string): S3ProviderDescriptor {
  const overrides = providerDescriptors[key] ?? {};
  return { ...defaultDescriptor, ...overrides };
}

/** Renders an endpoint template by substituting `{region}` + helper field values. */
export function computeS3Endpoint(
  descriptor: S3ProviderDescriptor,
  region: string,
  helperValues: Record<string, string>,
): string | null {
  if (descriptor.endpointTemplate === undefined) return null;
  const template = descriptor.endpointTemplate;
  const tokens: Record<string, string> = { region, ...helperValues };
  const missing = template.match(/\{(\w+)\}/g)?.some((token) => {
    const name = token.slice(1, -1);
    return !tokens[name];
  });
  if (missing) return null;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => tokens[name] ?? "");
}
