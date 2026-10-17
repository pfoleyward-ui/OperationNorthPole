export const contact = {
  email: "santablizard@gmail.com",
  phone: "845-234-2858",
  phoneHref: "tel:8452342858",
} as const;

export type SocialPlatform = "facebook" | "instagram" | "youtube" | "tiktok";
export type SocialAccount = {
  platform: SocialPlatform;
  url: string;
  active: boolean;
  verified: boolean;
};

// Add accounts only after the owner supplies and verifies their URLs.
export const socialAccounts: readonly SocialAccount[] = [
  {
    platform: "facebook",
    url: "https://www.facebook.com/profile.php?id=61584693927127",
    active: true,
    verified: true,
  },
];
