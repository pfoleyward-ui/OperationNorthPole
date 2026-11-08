import { defineCloudflareConfig } from '@opennextjs/cloudflare';
// No ISR/revalidation or R2 bucket required by this site. No paid storage provisioned.
export default defineCloudflareConfig();
