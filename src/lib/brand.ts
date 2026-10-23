export const MENDLYX_BRAND = {
  name: "Mendlyx",
  legalName: "BAIFI Analytics & Defense LLC",
  emailSenderName: "Mendlyx",
  email: "baifi@baifisystems.com",
  siteUrl: "https://mendlyx.com",
  description: "AI-powered property operations for independent landlords and property managers.",
} as const;

export const MENDLYX_FROM = `${MENDLYX_BRAND.emailSenderName} <${MENDLYX_BRAND.email}>`;
